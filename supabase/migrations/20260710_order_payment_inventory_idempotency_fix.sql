-- Order payment inventory idempotency and admin paid-state hardening.
--
-- Execute manually after:
--   1) 20260623_payment_core_linkage.sql
--   2) 20260709_order_lifecycle_non_payment_hardening.sql
--   3) 20260708_order_payment_currency_snapshot_fix.sql, if BEP20 is enabled
--
-- Purpose:
-- - create_order_with_item owns stock deduction / digital reservation.
-- - complete_order_payment must not deduct product or SKU stock a second time.
-- - generic admin order status updates must not mark orders as paid or set payment_status=paid.
--
-- This migration does not modify existing order, payment, product, SKU, or inventory data.

create extension if not exists pgcrypto;

do $$
declare
  v_table text;
  v_column text;
  v_status text;
  v_status_attnum smallint;
  v_payment_status_attnum smallint;
begin
  foreach v_table in array array[
    'public.orders',
    'public.order_items',
    'public.order_payments',
    'public.order_status_logs',
    'public.products',
    'public.product_skus',
    'public.digital_inventory'
  ] loop
    if to_regclass(v_table) is null then
      raise exception 'order payment inventory idempotency fix requires %', v_table;
    end if;
  end loop;

  foreach v_column in array array[
    'id',
    'user_id',
    'order_no',
    'status',
    'payment_status',
    'total_amount',
    'currency',
    'payment_method',
    'paid_at',
    'updated_at',
    'admin_note',
    'processed_at',
    'completed_at',
    'cancelled_at',
    'expired_at'
  ] loop
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'orders'
        and column_name = v_column
    ) then
      raise exception 'order payment inventory idempotency fix requires public.orders.%', v_column;
    end if;
  end loop;

  foreach v_column in array array[
    'payment_no',
    'order_id',
    'user_id',
    'payment_method',
    'amount',
    'currency',
    'status',
    'provider_trade_no',
    'paid_at',
    'updated_at',
    'order_amount',
    'order_currency',
    'received_amount',
    'received_currency'
  ] loop
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'order_payments'
        and column_name = v_column
    ) then
      raise exception 'order payment inventory idempotency fix requires public.order_payments.%', v_column;
    end if;
  end loop;

  foreach v_column in array array[
    'order_id',
    'from_status',
    'to_status',
    'operator_id',
    'operator_type',
    'note'
  ] loop
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'order_status_logs'
        and column_name = v_column
    ) then
      raise exception 'order payment inventory idempotency fix requires public.order_status_logs.%', v_column;
    end if;
  end loop;

  if to_regprocedure('public.complete_order_payment(uuid,text,text,text,numeric,text,timestamp with time zone)') is null then
    raise exception 'order payment inventory idempotency fix requires public.complete_order_payment(uuid,text,text,text,numeric,text,timestamp with time zone)';
  end if;
  if to_regprocedure('public.admin_update_order_status(uuid,text,text,text)') is null then
    raise exception 'order payment inventory idempotency fix requires public.admin_update_order_status(uuid,text,text,text)';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'order payment inventory idempotency fix requires public.is_admin()';
  end if;
  if to_regprocedure('public.release_order_inventory(uuid,text)') is null then
    raise exception 'order payment inventory idempotency fix requires public.release_order_inventory(uuid,text)';
  end if;

  if not exists (
    select 1
    from pg_index i
    join pg_class t on t.oid = i.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attname = 'payment_no'
    where n.nspname = 'public'
      and t.relname = 'order_payments'
      and i.indisunique
      and a.attnum = any(i.indkey)
  ) then
    raise exception 'order payment inventory idempotency fix requires a UNIQUE index or constraint on public.order_payments.payment_no';
  end if;

  select attnum into v_status_attnum
  from pg_attribute
  where attrelid = 'public.orders'::regclass
    and attname = 'status'
    and not attisdropped;

  select attnum into v_payment_status_attnum
  from pg_attribute
  where attrelid = 'public.orders'::regclass
    and attname = 'payment_status'
    and not attisdropped;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and contype = 'c'
      and conkey @> array[v_status_attnum]
  ) then
    foreach v_status in array array[
      'pending_payment',
      'paid',
      'processing',
      'delivered',
      'completed',
      'cancelled',
      'expired',
      'refunded',
      'failed'
    ] loop
      if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.orders'::regclass
          and contype = 'c'
          and conkey @> array[v_status_attnum]
          and pg_get_constraintdef(oid) like '%' || quote_literal(v_status) || '%'
      ) then
        raise exception 'public.orders.status CHECK constraint does not allow %', v_status;
      end if;
    end loop;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and contype = 'c'
      and conkey @> array[v_payment_status_attnum]
  ) then
    foreach v_status in array array[
      'unpaid',
      'paid',
      'refunded',
      'partially_refunded',
      'failed'
    ] loop
      if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.orders'::regclass
          and contype = 'c'
          and conkey @> array[v_payment_status_attnum]
          and pg_get_constraintdef(oid) like '%' || quote_literal(v_status) || '%'
      ) then
        raise exception 'public.orders.payment_status CHECK constraint does not allow %', v_status;
      end if;
    end loop;
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

create or replace function public.complete_order_payment(
  p_order_id uuid,
  p_session_no text,
  p_channel_code text,
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
  v_order public.orders;
  v_from_status text;
  v_next_status text;
  v_payment_no text := 'AUTO-' || coalesce(nullif(btrim(p_session_no), ''), p_order_id::text);
  v_provider_trade_no text := nullif(btrim(coalesce(p_provider_transaction_id, '')), '');
  v_channel text := lower(coalesce(nullif(btrim(p_channel_code), ''), 'unknown'));
begin
  if auth.role() <> 'service_role' then
    raise exception 'complete_order_payment can only be called by trusted server role';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'order not found';
  end if;

  if v_order.payment_status = 'paid' then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'businessType', 'order',
      'businessId', v_order.id,
      'businessNo', v_order.order_no,
      'status', v_order.status,
      'paymentStatus', v_order.payment_status
    );
  end if;

  if v_order.status in ('cancelled', 'expired', 'refunded', 'failed') then
    raise exception 'current order status does not allow payment completion';
  end if;

  if round(coalesce(p_paid_amount, 0)::numeric, 6)
     <> round(coalesce(v_order.total_amount, 0)::numeric, 6) then
    raise exception 'paid amount does not match order amount';
  end if;

  if upper(coalesce(p_currency, 'CNY')) <> upper(coalesce(v_order.currency, 'CNY')) then
    raise exception 'paid currency does not match order currency';
  end if;

  if v_provider_trade_no is not null and exists (
    select 1
    from public.order_payments op
    where op.provider_trade_no = v_provider_trade_no
      and op.order_id <> v_order.id
  ) then
    raise exception 'provider transaction is already used by another order';
  end if;

  -- Inventory is already deducted or reserved by create_order_with_item.
  -- Do not update public.products, public.product_skus, or public.digital_inventory here.
  v_from_status := v_order.status;
  v_next_status := case
    when v_order.status = 'pending_payment' then 'paid'
    else v_order.status
  end;

  update public.orders
  set payment_status = 'paid',
      status = v_next_status,
      payment_method = v_channel,
      paid_at = coalesce(p_paid_at, now()),
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  insert into public.order_payments (
    payment_no,
    order_id,
    user_id,
    payment_method,
    amount,
    currency,
    status,
    transaction_reference,
    submitted_at,
    reviewed_at,
    business_type,
    channel,
    business_amount,
    fee_amount,
    payable_amount,
    received_amount,
    order_amount,
    order_currency,
    received_currency,
    provider_trade_no,
    paid_at,
    callback_status
  ) values (
    v_payment_no,
    v_order.id,
    v_order.user_id,
    v_channel,
    v_order.total_amount,
    upper(coalesce(v_order.currency, 'CNY')),
    'paid',
    v_provider_trade_no,
    now(),
    now(),
    'order',
    v_channel,
    v_order.total_amount,
    0,
    v_order.total_amount,
    p_paid_amount,
    v_order.total_amount,
    upper(coalesce(v_order.currency, 'CNY')),
    upper(coalesce(p_currency, v_order.currency, 'CNY')),
    v_provider_trade_no,
    coalesce(p_paid_at, now()),
    'success'
  )
  on conflict (payment_no) do update
  set status = 'paid',
      provider_trade_no = coalesce(excluded.provider_trade_no, public.order_payments.provider_trade_no),
      transaction_reference = coalesce(excluded.transaction_reference, public.order_payments.transaction_reference),
      amount = excluded.amount,
      currency = excluded.currency,
      business_amount = excluded.business_amount,
      payable_amount = excluded.payable_amount,
      received_amount = excluded.received_amount,
      order_amount = excluded.order_amount,
      order_currency = excluded.order_currency,
      received_currency = excluded.received_currency,
      paid_at = coalesce(public.order_payments.paid_at, excluded.paid_at),
      callback_status = 'success',
      updated_at = now();

  insert into public.order_status_logs (
    order_id, from_status, to_status, operator_id, operator_type, note
  ) values (
    v_order.id,
    v_from_status,
    v_next_status,
    null,
    'system',
    'payment flow confirmed payment; inventory was already handled at order creation'
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'businessType', 'order',
    'businessId', v_order.id,
    'businessNo', v_order.order_no,
    'status', v_order.status,
    'paymentStatus', v_order.payment_status
  );
end;
$$;

revoke execute on function public.complete_order_payment(uuid,text,text,text,numeric,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.complete_order_payment(uuid,text,text,text,numeric,text,timestamptz)
  to service_role;

create or replace function public.admin_update_order_status(
  p_order_id uuid,
  p_to_status text,
  p_payment_status text default null,
  p_admin_note text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_from_status text;
  v_to_status text := lower(nullif(btrim(coalesce(p_to_status, '')), ''));
  v_payment_status text := lower(nullif(btrim(coalesce(p_payment_status, '')), ''));
  v_release jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin permission required';
  end if;

  if v_to_status in ('paid', 'payment_completed', 'completed_payment')
     or v_payment_status = 'paid' then
    raise exception 'ORDER_PAYMENT_STATUS_REQUIRES_PAYMENT_FLOW: use complete_payment_session / complete_order_payment for paid transitions';
  end if;

  if v_to_status not in ('pending_payment','processing','delivered','completed','cancelled','expired','refunded','failed') then
    raise exception 'invalid order status';
  end if;

  if v_payment_status is not null
     and v_payment_status not in ('unpaid','refunded','partially_refunded','failed') then
    raise exception 'invalid payment status';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'order not found';
  end if;

  v_from_status := v_order.status;

  if v_to_status in ('cancelled', 'expired') then
    v_release := public.release_order_inventory(
      p_order_id,
      'admin_status:' || v_to_status || ':' || coalesce(nullif(btrim(p_admin_note), ''), 'no_reason')
    );
  end if;

  update public.orders
  set status = v_to_status,
      payment_status = coalesce(v_payment_status, payment_status),
      admin_note = coalesce(nullif(trim(p_admin_note), ''), admin_note),
      processed_at = case when v_to_status = 'processing' and processed_at is null then now() else processed_at end,
      completed_at = case when v_to_status = 'completed' and completed_at is null then now() else completed_at end,
      cancelled_at = case when v_to_status = 'cancelled' and cancelled_at is null then now() else cancelled_at end,
      expired_at = case when v_to_status = 'expired' and expired_at is null then now() else expired_at end,
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  insert into public.order_status_logs (
    order_id, from_status, to_status, operator_id, operator_type, note
  ) values (
    p_order_id,
    v_from_status,
    v_to_status,
    auth.uid(),
    'admin',
    nullif(trim(coalesce(p_admin_note, '')), '')
  );

  return v_order;
end;
$$;

revoke execute on function public.admin_update_order_status(uuid,text,text,text)
  from anon;
grant execute on function public.admin_update_order_status(uuid,text,text,text)
  to authenticated, service_role;

-- Manual rollback guidance:
-- Reapply the previous complete_order_payment/admin_update_order_status function bodies only after
-- confirming no pending payment callback or admin status update is running. Do not mutate historical
-- orders, payments, product stock, SKU stock, or digital inventory during rollback.
