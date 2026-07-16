-- Order status constraints verification.
--
-- Use this file around:
--   supabase/migrations/20260710_order_status_constraints_compatibility.sql
--
-- Do not run the transaction section in production unless you have reviewed the
-- rollback behavior and selected a safe test user. The transaction rolls back.

-- 1. Current status and payment_status constraint definitions.
select
  con.conname,
  pg_get_constraintdef(con.oid) as constraint_definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'orders'
  and con.conname in ('orders_status_check', 'orders_payment_status_check')
order by con.conname;

-- 2. Current distinct values in the table.
select status, count(*) as order_count
from public.orders
group by status
order by status;

select payment_status, count(*) as order_count
from public.orders
group by payment_status
order by payment_status;

-- 3. Unknown value preflight. These must return zero rows before applying the migration.
with allowed_statuses(status) as (
  values
    ('pending_payment'),
    ('paid'),
    ('processing'),
    ('delivered'),
    ('completed'),
    ('cancelled'),
    ('expired'),
    ('refunded'),
    ('failed')
)
select o.status as unknown_order_status, count(*) as order_count
from public.orders o
left join allowed_statuses a on a.status = o.status
where a.status is null
group by o.status
order by o.status;

with allowed_payment_statuses(payment_status) as (
  values
    ('unpaid'),
    ('paid'),
    ('refunded'),
    ('partially_refunded'),
    ('failed')
)
select o.payment_status as unknown_payment_status, count(*) as order_count
from public.orders o
left join allowed_payment_statuses a on a.payment_status = o.payment_status
where a.payment_status is null
group by o.payment_status
order by o.payment_status;

-- 4. Simple definition check. After migration, both expired and failed should be present.
select
  con.conname,
  case when pg_get_constraintdef(con.oid) like '%expired%' then 'allows_expired' else 'missing_expired' end as expired_check,
  case when pg_get_constraintdef(con.oid) like '%failed%' then 'allows_failed' else 'missing_failed' end as failed_check
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'orders'
  and con.conname = 'orders_status_check';

-- 5. Rollback verification after migration.
-- Replace TEST_USER_UUID only in Jianlian-shop-test if auth.users has no suitable row.
BEGIN;

DO $$
declare
  v_test_user_id uuid;
  v_order_id uuid := gen_random_uuid();
  v_order_no text := 'VERIFY-ORDER-STATUS-' || replace(gen_random_uuid()::text, '-', '');
begin
  select id into v_test_user_id
  from auth.users
  order by created_at
  limit 1;

  if v_test_user_id is null then
    raise exception 'ORDER_STATUS_CONSTRAINT_VERIFICATION requires at least one auth.users row in the test database';
  end if;

  insert into public.orders(
    id,
    order_no,
    user_id,
    status,
    payment_status,
    total_amount,
    currency,
    created_at,
    updated_at
  )
  values (
    v_order_id,
    v_order_no,
    v_test_user_id,
    'pending_payment',
    'unpaid',
    0,
    'CNY',
    now(),
    now()
  );

  update public.orders
     set status = 'expired'
   where id = v_order_id;
  raise notice 'PASS: orders.status accepts expired';

  update public.orders
     set status = 'failed'
   where id = v_order_id;
  raise notice 'PASS: orders.status accepts failed';

  update public.orders
     set status = 'cancelled'
   where id = v_order_id;
  raise notice 'PASS: orders.status still accepts cancelled';

  update public.orders
     set status = 'refunded'
   where id = v_order_id;
  raise notice 'PASS: orders.status still accepts refunded';

  begin
    update public.orders
       set status = 'verification_invalid_status'
     where id = v_order_id;
    raise exception 'orders.status accepted an invalid status';
  exception
    when check_violation then
      raise notice 'PASS: orders.status rejects invalid status';
  end;

  if not exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'orders'
      and con.conname = 'orders_payment_status_check'
      and pg_get_constraintdef(con.oid) like '%partially_refunded%'
  ) then
    raise exception 'orders_payment_status_check was unexpectedly changed or is missing partially_refunded';
  end if;
  raise notice 'PASS: payment_status constraint still contains partially_refunded';
end $$;

ROLLBACK;
