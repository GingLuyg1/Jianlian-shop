-- Candidate only. Execute manually after separate Production authorization.
-- Adds the final database expiry guards used by Liuhaoyi Alipay recharge recovery.

begin;
set local search_path = pg_catalog, public;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
declare
  v_type text;
  v_security_definer boolean;
  v_config text[];
  v_definition text;
begin
  if to_regprocedure('public.complete_payment_session(uuid,text,numeric,text,timestamp with time zone)') is null then
    raise exception 'complete_payment_session prerequisite is missing';
  end if;
  if to_regprocedure('public.complete_account_recharge(uuid,text,numeric,text)') is null then
    raise exception 'complete_account_recharge prerequisite is missing';
  end if;

  select p.prosecdef, p.proconfig, pg_catalog.pg_get_functiondef(p.oid)
  into v_security_definer, v_config, v_definition
  from pg_catalog.pg_proc p
  where p.oid = 'public.complete_payment_session(uuid,text,numeric,text,timestamp with time zone)'::regprocedure;
  if v_security_definer is distinct from true
     or v_config is distinct from array['search_path=public']::text[]
     or position('public.complete_order_payment' in v_definition) = 0
     or position('public.complete_account_recharge' in v_definition) = 0
     or position('received_currency' in v_definition) = 0 then
    raise exception 'complete_payment_session definition does not match the expected baseline';
  end if;

  select p.prosecdef, p.proconfig, pg_catalog.pg_get_functiondef(p.oid)
  into v_security_definer, v_config, v_definition
  from pg_catalog.pg_proc p
  where p.oid = 'public.complete_account_recharge(uuid,text,numeric,text)'::regprocedure;
  if v_security_definer is distinct from true
     or v_config is distinct from array['search_path=public']::text[]
     or position('public.credit_account_recharge_balance' in v_definition) = 0
     or position('alreadyCompleted' in v_definition) = 0 then
    raise exception 'complete_account_recharge definition does not match the expected baseline';
  end if;

  select format_type(a.atttypid, a.atttypmod)
  into v_type
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.payment_sessions'::regclass
    and a.attname = 'expires_at'
    and a.attnum > 0
    and not a.attisdropped;
  if v_type is distinct from 'timestamp with time zone' then
    raise exception 'payment_sessions.expires_at must be timestamp with time zone';
  end if;

  select format_type(a.atttypid, a.atttypmod)
  into v_type
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.account_recharges'::regclass
    and a.attname = 'expires_at'
    and a.attnum > 0
    and not a.attisdropped;
  if v_type is distinct from 'timestamp with time zone' then
    raise exception 'account_recharges.expires_at must be timestamp with time zone';
  end if;
end $$;

create or replace function public.complete_payment_session(
  p_session_id uuid,
  p_provider_transaction_id text,
  p_paid_amount numeric,
  p_currency text,
  p_paid_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.payment_sessions;
  v_order public.orders;
  v_result jsonb;
  v_payment_id uuid;
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

  if v_session.business_type in ('recharge', 'account_recharge')
     and v_session.expires_at is not null
     and v_session.expires_at <= now() then
    raise exception 'expired recharge payment session cannot be completed';
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
      p_paid_at
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
        paid_at = coalesce(p_paid_at, paid_at, now()),
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
      p_currency
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
      paid_at = coalesce(p_paid_at, now()),
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
$$;

revoke execute on function public.complete_payment_session(uuid,text,numeric,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.complete_payment_session(uuid,text,numeric,text,timestamptz)
  to service_role;

create or replace function public.complete_account_recharge(
  p_recharge_id uuid,
  p_provider_transaction_id text,
  p_paid_amount numeric,
  p_currency text default 'CNY'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recharge public.account_recharges;
  v_transaction public.balance_transactions;
begin
  if auth.role() <> 'service_role' then
    raise exception 'complete_account_recharge can only be called by trusted server role';
  end if;

  select * into v_recharge
  from public.account_recharges
  where id = p_recharge_id
  for update;

  if not found then
    raise exception '充值单不存在';
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
    raise exception '充值单状态不允许入账';
  end if;

  if v_recharge.expires_at is not null and v_recharge.expires_at <= now() then
    raise exception 'expired account recharge cannot be credited';
  end if;

  if exists (
    select 1
    from public.account_recharges ar
    where ar.provider_trade_no = nullif(p_provider_transaction_id, '')
      and ar.id <> v_recharge.id
  ) then
    raise exception '渠道交易号已被其他充值单使用';
  end if;

  select * into v_transaction
  from public.credit_account_recharge_balance(
    v_recharge.recharge_no,
    p_provider_transaction_id,
    p_paid_amount,
    p_currency
  );

  return jsonb_build_object(
    'ok', true,
    'alreadyCompleted', false,
    'rechargeNo', v_recharge.recharge_no,
    'transactionNo', v_transaction.transaction_no,
    'balanceAfter', v_transaction.balance_after
  );
end;
$$;

revoke execute on function public.complete_account_recharge(uuid,text,numeric,text)
  from public, anon, authenticated;
grant execute on function public.complete_account_recharge(uuid,text,numeric,text)
  to service_role;

commit;
