-- Forward-only fix for trusted provider payments completed before expiry but
-- processed after expiry. This migration only replaces function definitions;
-- it does not update historical payment, recharge, balance, or ledger rows.

begin;
set local search_path = pg_catalog, public;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
declare
  v_account_definition text;
  v_session_definition text;
  v_account_security_definer boolean;
  v_session_security_definer boolean;
  v_account_config text[];
  v_session_config text[];
begin
  if to_regprocedure('public.complete_account_recharge(uuid,text,numeric,text)') is null
     or to_regprocedure('public.complete_payment_session(uuid,text,numeric,text,timestamp with time zone)') is null
     or to_regprocedure('public.credit_account_recharge_balance(text,text,numeric,text)') is null then
    raise exception 'PAID_BEFORE_EXPIRY_PREFLIGHT_FUNCTION_MISSING';
  end if;
  if to_regprocedure('public.complete_account_recharge(uuid,text,numeric,text,timestamp with time zone)') is not null then
    raise exception 'PAID_BEFORE_EXPIRY_PREFLIGHT_UNEXPECTED_OVERLOAD';
  end if;

  select pg_catalog.pg_get_functiondef(p.oid), p.prosecdef, p.proconfig
    into v_account_definition, v_account_security_definer, v_account_config
  from pg_catalog.pg_proc p
  where p.oid = 'public.complete_account_recharge(uuid,text,numeric,text)'::regprocedure;

  select pg_catalog.pg_get_functiondef(p.oid), p.prosecdef, p.proconfig
    into v_session_definition, v_session_security_definer, v_session_config
  from pg_catalog.pg_proc p
  where p.oid = 'public.complete_payment_session(uuid,text,numeric,text,timestamp with time zone)'::regprocedure;

  if v_account_security_definer is distinct from true
     or v_account_config is distinct from array['search_path=public']::text[]
     or position('v_recharge.expires_at <= now()' in v_account_definition) = 0
     or position('public.credit_account_recharge_balance' in v_account_definition) = 0 then
    raise exception 'PAID_BEFORE_EXPIRY_PREFLIGHT_ACCOUNT_BASELINE_MISMATCH';
  end if;
  if v_session_security_definer is distinct from true
     or v_session_config is distinct from array['search_path=public']::text[]
     or position('v_session.expires_at <= now()' in v_session_definition) = 0
     or position('public.complete_account_recharge' in v_session_definition) = 0 then
    raise exception 'PAID_BEFORE_EXPIRY_PREFLIGHT_SESSION_BASELINE_MISMATCH';
  end if;
end;
$$;

create or replace function public.complete_account_recharge(
  p_recharge_id uuid,
  p_provider_transaction_id text,
  p_paid_amount numeric,
  p_currency text,
  p_paid_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

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
begin
  return public.complete_account_recharge(
    p_recharge_id,
    p_provider_transaction_id,
    p_paid_amount,
    p_currency,
    statement_timestamp()
  );
end;
$$;

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
$$;

do $$
declare
  v_owner name;
begin
  select pg_catalog.pg_get_userbyid(p.proowner)
    into v_owner
  from pg_catalog.pg_proc p
  where p.oid = 'public.complete_account_recharge(uuid,text,numeric,text)'::regprocedure;
  execute format(
    'alter function public.complete_account_recharge(uuid,text,numeric,text,timestamptz) owner to %I',
    v_owner
  );
end;
$$;

revoke all on function public.complete_account_recharge(uuid,text,numeric,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.complete_account_recharge(uuid,text,numeric,text,timestamptz)
  to service_role;
revoke all on function public.complete_account_recharge(uuid,text,numeric,text)
  from public, anon, authenticated;
grant execute on function public.complete_account_recharge(uuid,text,numeric,text)
  to service_role;
revoke all on function public.complete_payment_session(uuid,text,numeric,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.complete_payment_session(uuid,text,numeric,text,timestamptz)
  to service_role;

do $$
declare
  v_definition text;
  v_security_definer boolean;
  v_config text[];
begin
  if to_regprocedure('public.complete_account_recharge(uuid,text,numeric,text,timestamp with time zone)') is null then
    raise exception 'PAID_BEFORE_EXPIRY_POSTCHECK_OVERLOAD_MISSING';
  end if;

  select pg_catalog.pg_get_functiondef(p.oid), p.prosecdef, p.proconfig
    into v_definition, v_security_definer, v_config
  from pg_catalog.pg_proc p
  where p.oid = 'public.complete_payment_session(uuid,text,numeric,text,timestamp with time zone)'::regprocedure;

  if v_security_definer is distinct from true
     or v_config is distinct from array['search_path=public']::text[]
     or position('v_effective_paid_at > v_session.expires_at' in v_definition) = 0
     or position('public.complete_account_recharge' in v_definition) = 0
     or position('v_effective_paid_at' in v_definition) = 0 then
    raise exception 'PAID_BEFORE_EXPIRY_POSTCHECK_SESSION_INVALID';
  end if;

  select pg_catalog.pg_get_functiondef(p.oid), p.prosecdef, p.proconfig
    into v_definition, v_security_definer, v_config
  from pg_catalog.pg_proc p
  where p.oid = 'public.complete_account_recharge(uuid,text,numeric,text,timestamp with time zone)'::regprocedure;

  if v_security_definer is distinct from true
     or v_config is distinct from array['search_path=public']::text[]
     or position('v_effective_paid_at > v_recharge.expires_at' in v_definition) = 0
     or position('public.credit_account_recharge_balance' in v_definition) = 0
     or position('for update' in v_definition) = 0 then
    raise exception 'PAID_BEFORE_EXPIRY_POSTCHECK_ACCOUNT_INVALID';
  end if;
end;
$$;

commit;
