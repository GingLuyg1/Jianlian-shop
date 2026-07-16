-- Order status constraint compatibility.
--
-- Scope:
-- - Align public.orders.status CHECK constraint with the current order lifecycle.
-- - Allow expire_unpaid_order(uuid,text) to persist status = 'expired'.
--
-- This migration intentionally does not modify order data, payment_status, or any
-- order/payment/delivery functions.

do $$
declare
  v_allowed_statuses constant text[] := array[
    'pending_payment',
    'paid',
    'processing',
    'delivered',
    'completed',
    'cancelled',
    'expired',
    'refunded',
    'failed'
  ];
  v_unknown_statuses text[];
begin
  if to_regclass('public.orders') is null then
    raise exception 'order status constraint compatibility requires public.orders';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'status'
  ) then
    raise exception 'order status constraint compatibility requires public.orders.status';
  end if;

  select array_agg(distinct status order by status)
    into v_unknown_statuses
  from public.orders
  where status is null
     or status <> all(v_allowed_statuses);

  if coalesce(array_length(v_unknown_statuses, 1), 0) > 0 then
    raise exception 'orders.status contains values outside the compatibility set: %', array_to_string(v_unknown_statuses, ', ');
  end if;
end $$;

alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (status in (
    'pending_payment',
    'paid',
    'processing',
    'delivered',
    'completed',
    'cancelled',
    'expired',
    'refunded',
    'failed'
  ));
