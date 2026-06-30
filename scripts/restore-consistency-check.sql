-- Jianlian Shop restore consistency checks.
-- Read-only checks. Run against a restored database before reopening writes.
-- Do not print digital_inventory.content or raw payment callback payloads.

select 'users' as check_name, count(*)::text as result from public.profiles
union all select 'products', count(*)::text from public.products
union all select 'skus', count(*)::text from public.product_skus
union all select 'orders', count(*)::text from public.orders
union all select 'payment_sessions', count(*)::text from public.payment_sessions
union all select 'account_recharges', count(*)::text from public.account_recharges
union all select 'balance_transactions', count(*)::text from public.balance_transactions
union all select 'refund_requests', count(*)::text from public.refund_requests
union all select 'digital_inventory', count(*)::text from public.digital_inventory
union all select 'order_deliveries', count(*)::text from public.order_deliveries;

select
  'negative_balances' as check_name,
  count(*) as issue_count
from public.profiles
where coalesce(balance, 0) < 0;

select
  'delivered_inventory_available' as check_name,
  count(*) as issue_count
from public.digital_inventory
where status = 'available'
  and delivered_order_id is not null;

select
  'duplicate_inventory_assignment' as check_name,
  count(*) as issue_count
from (
  select delivered_order_id, content_hash, count(*) as usage_count
  from public.digital_inventory
  where delivered_order_id is not null
  group by delivered_order_id, content_hash
  having count(*) > 1
) duplicated;

select
  'paid_recharge_without_balance_transaction' as check_name,
  count(*) as issue_count
from public.account_recharges r
where r.status in ('paid', 'succeeded')
  and not exists (
    select 1
    from public.balance_transactions bt
    where bt.business_id::text = r.id::text
       or bt.reference_no = r.recharge_no
  );

select
  'delivered_order_without_delivery_record' as check_name,
  count(*) as issue_count
from public.orders o
where o.status in ('delivered', 'completed')
  and not exists (
    select 1
    from public.order_deliveries d
    where d.order_id = o.id
  );
