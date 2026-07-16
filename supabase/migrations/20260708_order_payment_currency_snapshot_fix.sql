-- BEP20/payment currency snapshot fix for order_payments.
-- Execute manually after:
--   1) 20260620_order_payments.sql
--   2) 20260622_super_admin_payment_console.sql
--   3) 20260623_payment_provider_core.sql
--   4) 20260623_payment_core_linkage.sql
--   5) 20260708_bep20_phase1_completion_hardening.sql
--
-- Purpose:
-- - Keep order original amount/currency separate from channel received amount/currency.
-- - Preserve order_payments.amount/currency as the order snapshot for legacy screens.
-- - Store external/BEP20 received values in received_amount/received_currency.
-- - Widen existing numeric(12,2) payment columns so USDT values like 9.583334 are not rounded.

do $$
begin
  if to_regclass('public.order_payments') is null then
    raise exception 'order payment currency snapshot fix requires public.order_payments';
  end if;
  if to_regclass('public.payment_sessions') is null then
    raise exception 'order payment currency snapshot fix requires public.payment_sessions';
  end if;
  if to_regclass('public.orders') is null then
    raise exception 'order payment currency snapshot fix requires public.orders';
  end if;
  if to_regprocedure('public.complete_order_payment(uuid,text,text,text,numeric,text,timestamp with time zone)') is null then
    raise exception 'order payment currency snapshot fix requires complete_order_payment';
  end if;
end $$;

alter table public.order_payments
  add column if not exists business_amount numeric(18, 6),
  add column if not exists fee_amount numeric(18, 6) not null default 0,
  add column if not exists payable_amount numeric(18, 6),
  add column if not exists received_amount numeric(18, 6),
  add column if not exists order_amount numeric(18, 6),
  add column if not exists order_currency text,
  add column if not exists received_currency text;

alter table public.order_payments
  alter column amount type numeric(18, 6) using amount::numeric(18, 6),
  alter column business_amount type numeric(18, 6) using business_amount::numeric(18, 6),
  alter column fee_amount type numeric(18, 6) using fee_amount::numeric(18, 6),
  alter column payable_amount type numeric(18, 6) using payable_amount::numeric(18, 6),
  alter column received_amount type numeric(18, 6) using received_amount::numeric(18, 6),
  alter column order_amount type numeric(18, 6) using order_amount::numeric(18, 6);

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

    -- complete_order_payment remains the canonical order state transition.
    -- It expects order original amount/currency, not the external channel amount.
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
