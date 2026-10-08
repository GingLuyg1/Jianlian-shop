-- Read-only audited Production definitions. Test fixture only, never deployed.
CREATE OR REPLACE FUNCTION public.complete_account_recharge(p_recharge_id uuid, p_provider_transaction_id text, p_paid_amount numeric, p_currency text, p_paid_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_recharge public.account_recharges;
  v_transaction public.balance_transactions;
  v_effective_paid_at timestamptz := coalesce(p_paid_at, statement_timestamp());
begin
  if auth.role() <> 'service_role' then
    raise exception 'complete_account_recharge can only be called by trusted server role';
  end if;

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

  if v_recharge.status in ('closed','expired','failed','refunded') then
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
    p_currency
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

REVOKE ALL ON FUNCTION public.complete_account_recharge(uuid,text,numeric,text,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.complete_account_recharge(uuid,text,numeric,text,timestamp with time zone) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_account_recharge(p_recharge_id uuid, p_provider_transaction_id text, p_paid_amount numeric, p_currency text DEFAULT 'CNY'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return public.complete_account_recharge(
    p_recharge_id,
    p_provider_transaction_id,
    p_paid_amount,
    p_currency,
    statement_timestamp()
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.complete_account_recharge(uuid,text,numeric,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.complete_account_recharge(uuid,text,numeric,text) TO service_role;

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

  if v_session.status in ('expired','closed','failed') then
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

REVOKE ALL ON FUNCTION public.complete_payment_session(uuid,text,numeric,text,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.complete_payment_session(uuid,text,numeric,text,timestamp with time zone) TO service_role;

CREATE OR REPLACE FUNCTION public.credit_account_recharge_balance(p_recharge_no text, p_provider_trade_no text, p_received_amount numeric, p_currency text DEFAULT 'CNY'::text)
 RETURNS balance_transactions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_recharge public.account_recharges;
  v_profile public.profiles;
  v_transaction public.balance_transactions;
  v_before numeric(18, 6);
  v_after numeric(18, 6);
  v_transaction_no text;
begin
  if auth.role() <> 'service_role'
     and not public.is_admin(auth.uid()) then
    raise exception '无权执行余额入账';
  end if;

  select * into v_recharge
  from public.account_recharges
  where recharge_no = p_recharge_no
  for update;

  if not found then
    raise exception '充值单不存在';
  end if;

  if v_recharge.status in (
    'closed',
    'expired',
    'failed',
    'refunded'
  ) then
    raise exception '充值单状态不允许入账';
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
    paid_at = coalesce(paid_at, now()),
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

REVOKE ALL ON FUNCTION public.credit_account_recharge_balance(text,text,numeric,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.credit_account_recharge_balance(text,text,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.credit_account_recharge_balance(text,text,numeric,text) TO service_role;
