-- Run only in the Jianlian-shop-test Supabase SQL Editor.
-- This file reads ownership and lifecycle state only. It never reads delivery secrets.

-- 1. Select a second ordinary authenticated user. Choose one manually.
select
  p.id,
  regexp_replace(coalesce(u.email, p.email, ''), '(^.).*(@.*$)', '\1***\2') as email_masked,
  p.role,
  coalesce(to_jsonb(p)->>'account_status', 'active') as account_status
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'user'
  and p.id <> 'b0a56264-aa77-4409-b91e-74a1442cf60e'::uuid
order by p.created_at nulls last
limit 20;

-- 2. Replace the three NULL values below before running this ownership check:
--    user_b_id, user_a_order_no, user_b_order_no.
with params as (
  select
    'b0a56264-aa77-4409-b91e-74a1442cf60e'::uuid as user_a_id,
    null::uuid as user_b_id,
    null::text as user_a_order_no,
    null::text as user_b_order_no
),
selected_orders as (
  select
    o.id,
    o.order_no,
    o.user_id,
    o.status,
    o.payment_status,
    o.reservation_released_at,
    o.cancelled_at
  from public.orders o
  cross join params p
  where o.order_no in (p.user_a_order_no, p.user_b_order_no)
),
item_counts as (
  select oi.order_id, count(*)::integer as order_item_count
  from public.order_items oi
  join selected_orders so on so.id = oi.order_id
  group by oi.order_id
),
reserved_inventory as (
  select
    coalesce(di.reserved_order_id, di.order_id) as order_id,
    count(*) filter (where di.status = 'reserved')::integer as reserved_inventory_count,
    count(*) filter (where di.status = 'delivered')::integer as delivered_inventory_count,
    count(distinct di.reserved_order_item_id)::integer as reserved_order_item_count
  from public.digital_inventory di
  join selected_orders so on so.id = coalesce(di.reserved_order_id, di.order_id)
  group by coalesce(di.reserved_order_id, di.order_id)
)
select
  so.order_no,
  so.user_id,
  case
    when so.user_id = p.user_a_id then 'USER_A'
    when so.user_id = p.user_b_id then 'USER_B'
    else 'UNEXPECTED_OWNER'
  end as expected_owner_match,
  so.status,
  so.payment_status,
  so.reservation_released_at,
  so.cancelled_at,
  coalesce(ic.order_item_count, 0) as order_item_count,
  coalesce(ri.reserved_inventory_count, 0) as reserved_inventory_count,
  coalesce(ri.delivered_inventory_count, 0) as delivered_inventory_count,
  coalesce(ri.reserved_order_item_count, 0) as reserved_order_item_count
from selected_orders so
cross join params p
left join item_counts ic on ic.order_id = so.id
left join reserved_inventory ri on ri.order_id = so.id
order by so.order_no;

