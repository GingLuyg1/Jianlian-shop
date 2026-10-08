-- Forward-only. Function DDL only: no row repair, backfill or payment execution.
-- Exact audited Production function baselines (CRLF normalized to LF).
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
declare x record; f record;
begin
  if current_user <> 'postgres' then raise exception 'BASELINE_OWNER_CONTEXT_UNEXPECTED'; end if;
  if to_regprocedure('public.credit_account_recharge_balance(text,text,numeric,text,timestamptz)') is not null then
    raise exception 'TRUSTED_CREDIT_OVERLOAD_ALREADY_EXISTS';
  end if;
  for x in select * from (values
      ('public.complete_account_recharge(uuid,text,numeric,text,timestamp with time zone)','f44d8b9624cf575f5bf8bd9528ad100e','{postgres=X/postgres,service_role=X/postgres}'),
      ('public.complete_account_recharge(uuid,text,numeric,text)','e556a1e4ec18ec843c4a2211a722ad72','{postgres=X/postgres,service_role=X/postgres}'),
      ('public.complete_payment_session(uuid,text,numeric,text,timestamp with time zone)','aeb91cb286bdb89e8cba9d0192a16d95','{postgres=X/postgres,service_role=X/postgres}'),
      ('public.credit_account_recharge_balance(text,text,numeric,text)','f7836aa21b0017ed57ed7d6c38e36699','{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}')
    ) as expected(signature,definition_md5,acl) loop
    select p.*,pg_get_userbyid(p.proowner) as owner_name into f from pg_proc p
      where p.oid=to_regprocedure(x.signature);
    if not found or md5(replace(pg_get_functiondef(f.oid),E'\r\n',E'\n')) <> x.definition_md5
       or f.owner_name <> 'postgres' or not f.prosecdef
       or f.proconfig is distinct from ARRAY['search_path=public']::text[]
       or f.proacl::text is distinct from x.acl then
      raise exception 'UNKNOWN_CANONICAL_FUNCTION_BASELINE: %',x.signature;
    end if;
  end loop;
end
$preflight$;

CREATE OR REPLACE FUNCTION public.complete_payment_session(p_session_id uuid, p_provider_transaction_id text, p_paid_amount numeric, p_currency text, p_paid_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_session public.payment_sessions;
  v_order public.orders;
  v_result jsonb;
  v_payment_id uuid;
  v_effective_paid_at timestamptz := coalesce(p_paid_at, statement_timestamp());
begin
  if auth.role() <> 'service_role' then
    raise exception 'complete_payment_session can only be called by trusted server role';
  end if;

  -- Lock the whole recharge session set before the selected row, so direct
  -- recharge/wrapper calls and session calls have the same lock ordering.
  perform 1 from public.payment_sessions
    where business_type in ('recharge','account_recharge')
      and business_id = (select business_id from public.payment_sessions
        where id=p_session_id and business_type in ('recharge','account_recharge'))
    order by id for update;

  select * into v_session
  from public.payment_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'payment session not found';
  end if;

  if v_session.status = 'paid' then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'businessType', case when v_session.business_type = 'order' then 'order' else 'recharge' end,
      'businessId', v_session.business_id,
      'businessNo', v_session.business_no
    );
  end if;

  if v_session.status in ('closed','failed')
     or (v_session.status = 'expired' and v_session.business_type not in ('recharge','account_recharge')) then
    raise exception 'payment session status does not allow completion';
  end if;

  if v_session.business_type in ('recharge', 'account_recharge') then
    if v_effective_paid_at < v_session.created_at
       or v_effective_paid_at > statement_timestamp() + interval '5 minutes' then
      raise exception 'trusted provider payment time is outside the payment session lifetime';
    end if;
    if v_session.expires_at is not null
       and v_effective_paid_at > v_session.expires_at then
      raise exception 'provider payment occurred after recharge payment session expiry';
    end if;
  end if;


  if v_session.status = 'expired' then
    if p_paid_at is null or not isfinite(p_paid_at)
       or v_session.created_at is null or v_session.expires_at is null
       or not exists(select 1 from public.account_recharges ar
          where ar.id = v_session.business_id
            and ar.user_id = v_session.user_id and ar.recharge_no = v_session.business_no
            and ar.provider is not distinct from v_session.provider
            and ar.channel_code is not distinct from v_session.channel_code
            and ar.status in ('pending','processing','expired')
            and coalesce(ar.credited_amount,0)=0
            and not exists(select 1 from public.balance_transactions bt
              where bt.business_type='account_recharge' and bt.business_id=ar.recharge_no and bt.status='completed')
            and ar.created_at is not null and ar.expires_at is not null
            and p_paid_at >= ar.created_at and p_paid_at <= ar.expires_at) then
      raise exception 'EXPIRED_SESSION_TRUSTED_RECHARGE_EVIDENCE_REQUIRED';
    end if;
  end if;

  if round(coalesce(p_paid_amount, 0), 6) <> round(coalesce(v_session.payable_amount, 0), 6) then
    raise exception 'received amount does not match frozen payment session amount';
  end if;

  if upper(coalesce(p_currency, '')) <> upper(coalesce(v_session.currency, '')) then
    raise exception 'received currency does not match payment session currency';
  end if;

  if exists (
    select 1
    from public.payment_sessions ps
    where ps.provider_transaction_id = nullif(p_provider_transaction_id, '')
      and ps.id <> v_session.id
  ) then
    raise exception 'provider transaction is already used by another payment session';
  end if;

  if v_session.business_type = 'order' then
    select * into v_order
    from public.orders
    where id = v_session.business_id
    for update;

    if not found then
      raise exception 'order not found';
    end if;

    if v_order.payment_status = 'paid' then
      raise exception 'order is already paid by a different completion path';
    end if;

    v_result := public.complete_order_payment(
      v_order.id,
      v_session.session_no,
      v_session.channel_code,
      p_provider_transaction_id,
      v_order.total_amount,
      v_order.currency,
      v_effective_paid_at
    );

    update public.order_payments
    set amount = v_order.total_amount,
        currency = upper(coalesce(v_order.currency, 'CNY')),
        business_amount = v_order.total_amount,
        payable_amount = v_order.total_amount,
        order_amount = v_order.total_amount,
        order_currency = upper(coalesce(v_order.currency, 'CNY')),
        received_amount = p_paid_amount,
        received_currency = upper(p_currency),
        paid_at = coalesce(v_effective_paid_at, paid_at, now()),
        callback_status = 'success',
        updated_at = now()
    where payment_no = 'AUTO-' || v_session.session_no
    returning id into v_payment_id;

    if v_payment_id is null then
      raise exception 'order payment record was not created for completed session';
    end if;
  else
    v_result := public.complete_account_recharge(
      v_session.business_id,
      p_provider_transaction_id,
      p_paid_amount,
      p_currency,
      v_effective_paid_at
    );
    v_result := jsonb_build_object(
      'ok', true,
      'idempotent', coalesce((v_result ->> 'alreadyCompleted')::boolean, false),
      'businessType', 'recharge',
      'businessId', v_session.business_id,
      'businessNo', v_session.business_no
    );
  end if;

  update public.payment_sessions
  set status = 'paid',
      provider_transaction_id = nullif(p_provider_transaction_id, ''),
      paid_at = v_effective_paid_at,
      last_synced_at = now(),
      reconcile_status = 'matched',
      last_error = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'order_amount', case when v_session.business_type = 'order' then v_order.total_amount else null end,
        'order_currency', case when v_session.business_type = 'order' then v_order.currency else null end,
        'channel_currency', upper(p_currency),
        'channel_received_amount', p_paid_amount,
        'initializing', false
      ),
      updated_at = now()
  where id = v_session.id;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_account_recharge(p_recharge_id uuid, p_provider_transaction_id text, p_paid_amount numeric, p_currency text, p_paid_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_recharge public.account_recharges;
  v_transaction public.balance_transactions;
  v_linked_session public.payment_sessions;
  v_linked_count bigint;
  v_effective_paid_at timestamptz := coalesce(p_paid_at, statement_timestamp());
begin
  if auth.role() <> 'service_role' then
    raise exception 'complete_account_recharge can only be called by trusted server role';
  end if;


  -- Consistent lock order: session(s), recharge, profile.
  perform 1 from public.payment_sessions
    where business_id = p_recharge_id and business_type in ('recharge','account_recharge')
    order by id for update;

  select * into v_recharge
  from public.account_recharges
  where id = p_recharge_id
  for update;

  if not found then
    raise exception 'account recharge not found';
  end if;

  if v_recharge.status = 'paid' then
    select * into v_transaction
    from public.balance_transactions
    where business_type = 'account_recharge'
      and business_id = v_recharge.recharge_no
      and status = 'completed'
    limit 1;

    return jsonb_build_object(
      'ok', true,
      'alreadyCompleted', true,
      'rechargeNo', v_recharge.recharge_no,
      'transactionNo', v_transaction.transaction_no
    );
  end if;

  if v_recharge.status in ('closed','failed','refunded') then
    raise exception 'account recharge status does not allow completion';
  end if;

  if v_effective_paid_at < v_recharge.created_at
     or v_effective_paid_at > statement_timestamp() + interval '5 minutes' then
    raise exception 'trusted provider payment time is outside the recharge lifetime';
  end if;
  if v_recharge.expires_at is not null
     and v_effective_paid_at > v_recharge.expires_at then
    raise exception 'provider payment occurred after account recharge expiry';
  end if;


  -- Expired is recoverable only with explicit trusted evidence for BOTH lifetimes.
  if v_recharge.status = 'expired' then
    if p_paid_at is null or not isfinite(p_paid_at)
       or v_recharge.created_at is null or v_recharge.expires_at is null
       or p_paid_at < v_recharge.created_at or p_paid_at > v_recharge.expires_at
       or p_paid_at > statement_timestamp() + interval '5 minutes' then
      raise exception 'EXPIRED_RECHARGE_TRUSTED_TIME_REQUIRED';
    end if;
    select count(*) into v_linked_count from public.payment_sessions
      where business_id = v_recharge.id and business_type in ('recharge','account_recharge');
    if v_linked_count <> 1 then raise exception 'EXPIRED_RECHARGE_SESSION_NOT_UNIQUE'; end if;
    select * into v_linked_session from public.payment_sessions
      where business_id = v_recharge.id and business_type in ('recharge','account_recharge');
    if v_linked_session.status not in ('pending','processing','expired')
       or v_linked_session.user_id is distinct from v_recharge.user_id
       or v_linked_session.business_no is distinct from v_recharge.recharge_no
       or v_linked_session.provider is distinct from v_recharge.provider
       or v_linked_session.channel_code is distinct from v_recharge.channel_code
       or v_linked_session.created_at is null or v_linked_session.expires_at is null
       or p_paid_at < v_linked_session.created_at or p_paid_at > v_linked_session.expires_at
       or round(p_paid_amount,6) is distinct from round(v_linked_session.payable_amount,6)
       or upper(p_currency) is distinct from upper(v_linked_session.currency) then
      raise exception 'EXPIRED_RECHARGE_SESSION_EVIDENCE_INVALID';
    end if;
    if exists(select 1 from public.payment_sessions
      where provider_transaction_id = nullif(btrim(p_provider_transaction_id),'')
        and id <> v_linked_session.id) then
      raise exception 'EXPIRED_RECHARGE_TRANSACTION_CONFLICT';
    end if;
    if coalesce(v_recharge.credited_amount,0) <> 0 or exists(select 1 from public.balance_transactions
      where business_type='account_recharge' and business_id=v_recharge.recharge_no and status='completed') then
      raise exception 'EXPIRED_RECHARGE_EXISTING_CREDIT_CONFLICT';
    end if;
  end if;

  if nullif(btrim(p_provider_transaction_id),'') is null then
    raise exception 'PROVIDER_TRANSACTION_REQUIRED';
  end if;

  if exists (
    select 1
    from public.account_recharges ar
    where ar.provider_trade_no = nullif(p_provider_transaction_id, '')
      and ar.id <> v_recharge.id
  ) then
    raise exception 'provider transaction is already used by another recharge';
  end if;

  select * into v_transaction
  from public.credit_account_recharge_balance(
    v_recharge.recharge_no,
    p_provider_transaction_id,
    p_paid_amount,
    p_currency,
    v_effective_paid_at
  );

  update public.account_recharges
  set paid_at = v_effective_paid_at,
      updated_at = now()
  where id = v_recharge.id;

  return jsonb_build_object(
    'ok', true,
    'alreadyCompleted', false,
    'rechargeNo', v_recharge.recharge_no,
    'transactionNo', v_transaction.transaction_no,
    'balanceAfter', v_transaction.balance_after
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_account_recharge(p_recharge_id uuid, p_provider_transaction_id text, p_paid_amount numeric, p_currency text DEFAULT 'CNY'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status text;
begin
  if auth.role() <> 'service_role' then raise exception 'WRAPPER_SERVICE_ROLE_REQUIRED'; end if;

  -- Consistent lock order: session(s), recharge, profile.
  perform 1 from public.payment_sessions
    where business_id = p_recharge_id and business_type in ('recharge','account_recharge')
    order by id for update;

  select status into v_status from public.account_recharges where id=p_recharge_id for update;
  if v_status = 'expired' then raise exception 'UNTRUSTED_WRAPPER_EXPIRED_REJECTED'; end if;
  return public.complete_account_recharge(
    p_recharge_id,
    p_provider_transaction_id,
    p_paid_amount,
    p_currency,
    statement_timestamp()
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.credit_account_recharge_balance(p_recharge_no text, p_provider_trade_no text, p_received_amount numeric, p_currency text, p_paid_at timestamp with time zone)
 RETURNS balance_transactions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_recharge public.account_recharges;
  v_profile public.profiles;
  v_transaction public.balance_transactions;
  v_linked_session public.payment_sessions;
  v_linked_count bigint;
  v_before numeric(18, 6);
  v_after numeric(18, 6);
  v_transaction_no text;
begin
  if auth.role() <> 'service_role' then
    raise exception '无权执行余额入账';
  end if;


  perform 1 from public.payment_sessions
    where business_id = (select id from public.account_recharges where recharge_no=p_recharge_no)
      and business_type in ('recharge','account_recharge')
    order by id for update;

  select * into v_recharge
  from public.account_recharges
  where recharge_no = p_recharge_no
  for update;

  if not found then
    raise exception '充值单不存在';
  end if;

  if v_recharge.status in (
    'closed',
    'failed',
    'refunded'
  ) then
    raise exception '充值单状态不允许入账';
  end if;


  if p_paid_at is null or not isfinite(p_paid_at)
     or p_paid_at < v_recharge.created_at
     or p_paid_at > statement_timestamp() + interval '5 minutes'
     or (v_recharge.expires_at is not null and p_paid_at > v_recharge.expires_at) then
    raise exception 'TRUSTED_CREDIT_TIME_INVALID';
  end if;

  -- Expired is recoverable only with explicit trusted evidence for BOTH lifetimes.
  if v_recharge.status = 'expired' then
    if p_paid_at is null or not isfinite(p_paid_at)
       or v_recharge.created_at is null or v_recharge.expires_at is null
       or p_paid_at < v_recharge.created_at or p_paid_at > v_recharge.expires_at
       or p_paid_at > statement_timestamp() + interval '5 minutes' then
      raise exception 'EXPIRED_RECHARGE_TRUSTED_TIME_REQUIRED';
    end if;
    select count(*) into v_linked_count from public.payment_sessions
      where business_id = v_recharge.id and business_type in ('recharge','account_recharge');
    if v_linked_count <> 1 then raise exception 'EXPIRED_RECHARGE_SESSION_NOT_UNIQUE'; end if;
    select * into v_linked_session from public.payment_sessions
      where business_id = v_recharge.id and business_type in ('recharge','account_recharge');
    if v_linked_session.status not in ('pending','processing','expired')
       or v_linked_session.user_id is distinct from v_recharge.user_id
       or v_linked_session.business_no is distinct from v_recharge.recharge_no
       or v_linked_session.provider is distinct from v_recharge.provider
       or v_linked_session.channel_code is distinct from v_recharge.channel_code
       or v_linked_session.created_at is null or v_linked_session.expires_at is null
       or p_paid_at < v_linked_session.created_at or p_paid_at > v_linked_session.expires_at
       or round(p_received_amount,6) is distinct from round(v_linked_session.payable_amount,6)
       or upper(p_currency) is distinct from upper(v_linked_session.currency) then
      raise exception 'EXPIRED_RECHARGE_SESSION_EVIDENCE_INVALID';
    end if;
    if exists(select 1 from public.payment_sessions
      where provider_transaction_id = nullif(btrim(p_provider_trade_no),'')
        and id <> v_linked_session.id) then
      raise exception 'EXPIRED_RECHARGE_TRANSACTION_CONFLICT';
    end if;
    if coalesce(v_recharge.credited_amount,0) <> 0 or exists(select 1 from public.balance_transactions
      where business_type='account_recharge' and business_id=v_recharge.recharge_no and status='completed') then
      raise exception 'EXPIRED_RECHARGE_EXISTING_CREDIT_CONFLICT';
    end if;
  end if;

  if nullif(btrim(p_provider_trade_no),'') is null then raise exception 'PROVIDER_TRANSACTION_REQUIRED'; end if;
  if exists(select 1 from public.account_recharges ar where ar.id <> v_recharge.id
      and ar.provider_trade_no = p_provider_trade_no) then
    raise exception 'PROVIDER_TRANSACTION_CONFLICT';
  end if;

  if round(
       coalesce(p_received_amount, 0)::numeric,
       6
     )
     <>
     round(
       coalesce(
         v_recharge.payable_amount,
         v_recharge.amount,
         0
       )::numeric,
       6
     ) then
    raise exception '到账金额与应付金额不一致';
  end if;

  if upper(
       coalesce(
         p_currency,
         v_recharge.currency,
         'CNY'
       )
     )
     <>
     upper(
       coalesce(
         v_recharge.currency,
         'CNY'
       )
     ) then
    raise exception '到账币种与充值单币种不一致';
  end if;

  select * into v_transaction
  from public.balance_transactions
  where business_type = 'account_recharge'
    and business_id = v_recharge.recharge_no
    and status = 'completed'
  limit 1;

  if found then
    return v_transaction;
  end if;

  select * into v_profile
  from public.profiles
  where id = v_recharge.user_id
  for update;

  if not found then
    raise exception '用户资料不存在';
  end if;

  v_before := coalesce(v_profile.balance, 0);

  v_after :=
    v_before
    + coalesce(v_recharge.amount, 0);

  v_transaction_no :=
    'BT'
    || to_char(now(), 'YYYYMMDDHH24MISS')
    || upper(
      substr(
        md5(random()::text),
        1,
        8
      )
    );

  update public.profiles
  set
    balance = v_after,
    updated_at = now()
  where id = v_recharge.user_id;

  update public.account_recharges
  set
    status = 'paid',
    provider_trade_no =
      coalesce(
        nullif(p_provider_trade_no, ''),
        provider_trade_no
      ),
    received_amount = p_received_amount,
    credited_amount = v_recharge.amount,
    paid_at = p_paid_at,
    completed_at = coalesce(completed_at, now()),
    callback_status = 'success',
    updated_at = now()
  where id = v_recharge.id;

  insert into public.balance_transactions (
    user_id,
    transaction_no,
    business_type,
    business_id,
    direction,
    amount,
    balance_before,
    balance_after,
    currency,
    status,
    remark,
    metadata
  )
  values (
    v_recharge.user_id,
    v_transaction_no,
    'account_recharge',
    v_recharge.recharge_no,
    'credit',
    v_recharge.amount,
    v_before,
    v_after,
    coalesce(v_recharge.currency, 'CNY'),
    'completed',
    '账户充值入账',
    jsonb_build_object(
      'provider_trade_no_present',
      nullif(p_provider_trade_no, '') is not null
    )
  )
  returning *
  into v_transaction;

  return v_transaction;
end;
$function$;


-- New trusted overload only. Legacy admin four-argument credit remains unchanged.
REVOKE ALL ON FUNCTION public.credit_account_recharge_balance(text,text,numeric,text,timestamptz)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.credit_account_recharge_balance(text,text,numeric,text,timestamptz) TO service_role;
DO $postcheck$
declare sig text; f record;
begin
  foreach sig in ARRAY ARRAY[
    'public.complete_payment_session(uuid,text,numeric,text,timestamptz)',
    'public.complete_account_recharge(uuid,text,numeric,text,timestamptz)',
    'public.complete_account_recharge(uuid,text,numeric,text)',
    'public.credit_account_recharge_balance(text,text,numeric,text,timestamptz)'
  ] loop
    select p.*,pg_get_userbyid(p.proowner) as owner_name into f from pg_proc p where p.oid=to_regprocedure(sig);
    if not found or f.owner_name <> 'postgres' or not f.prosecdef
       or f.proconfig is distinct from ARRAY['search_path=public']::text[]
       or f.proacl::text is distinct from '{postgres=X/postgres,service_role=X/postgres}'
       or exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a where a.grantee=0)
       or has_function_privilege('anon',sig,'EXECUTE')
       or has_function_privilege('authenticated',sig,'EXECUTE')
       or not has_function_privilege('service_role',sig,'EXECUTE') then
      raise exception 'CANONICAL_FUNCTION_SECURITY_POSTCHECK_FAILED: %',sig;
    end if;
  end loop;
  if md5(replace(pg_get_functiondef('public.credit_account_recharge_balance(text,text,numeric,text)'::regprocedure),E'\r\n',E'\n'))
      <> 'f7836aa21b0017ed57ed7d6c38e36699' then raise exception 'LEGACY_CREDIT_CHANGED'; end if;
  if position('EXPIRED_SESSION_TRUSTED_RECHARGE_EVIDENCE_REQUIRED' in pg_get_functiondef('public.complete_payment_session(uuid,text,numeric,text,timestamptz)'::regprocedure))=0
     or position('EXPIRED_RECHARGE_SESSION_EVIDENCE_INVALID' in pg_get_functiondef('public.complete_account_recharge(uuid,text,numeric,text,timestamptz)'::regprocedure))=0
     or position('UNTRUSTED_WRAPPER_EXPIRED_REJECTED' in pg_get_functiondef('public.complete_account_recharge(uuid,text,numeric,text)'::regprocedure))=0 then
    raise exception 'CANONICAL_FUNCTION_STRUCTURE_POSTCHECK_FAILED';
  end if;
end
$postcheck$;
COMMIT;
