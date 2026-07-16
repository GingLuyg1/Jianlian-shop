# Migration Preflight Checks

This document is read-only. Run these checks in the target Supabase project before applying pending migrations. Do not run migration SQL until every blocking item is resolved.

## 1. Confirm Target Project

Manually verify the Supabase project name and URL in the dashboard before running any check. Do not run these checks in production when preparing the test database.

## 2. Migration History Tables

```sql
select table_schema, table_name
from information_schema.tables
where (table_schema, table_name) in (
  ('supabase_migrations', 'schema_migrations'),
  ('public', 'schema_migrations'),
  ('public', 'app_migration_history')
)
order by table_schema, table_name;
```

```sql
select *
from public.app_migration_history
order by created_at desc
limit 50;
```

## 3. Required Core Tables

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles',
    'categories',
    'products',
    'product_skus',
    'orders',
    'order_items',
    'order_events',
    'order_payments',
    'payment_sessions',
    'digital_inventory',
    'inventory_reservations',
    'order_deliveries',
    'legal_documents',
    'chain_payment_sessions',
    'chain_transactions',
    'chain_transaction_claims',
    'admin_audit_logs'
  )
order by table_name;
```

## 4. Required Columns

```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'profiles',
    'categories',
    'products',
    'product_skus',
    'orders',
    'order_items',
    'order_payments',
    'payment_sessions',
    'digital_inventory',
    'order_deliveries',
    'chain_payment_sessions',
    'chain_transactions',
    'chain_transaction_claims'
  )
order by table_name, ordinal_position;
```

## 5. Status And Check Constraint Compatibility

The latest application code expects these status families:

- `products.status`: `draft`, `active`, `inactive`, `sold_out`
- `products.delivery_type`: `manual`, `automatic`, `shipping`
- `orders.status`: `pending`, `awaiting_payment`, `paid`, `processing`, `fulfilled`, `cancelled`, `expired`, `refunded`, `failed`
- `digital_inventory.status`: `available`, `reserved`, `delivered`, `disabled`, `expired`, `invalid`
- `chain_payment_sessions.status`: `waiting_payment`, `submitted`, `confirming`, `verified`, `completing`, `payment_failed`, `underpaid`, `manual_review`, `paid`, `rejected`, `cancelled`, `expired`

```sql
select id, status
from public.products
where status not in ('draft', 'active', 'inactive', 'sold_out');
```

```sql
select id, delivery_type
from public.products
where delivery_type not in ('manual', 'automatic', 'shipping');
```

```sql
select id, status
from public.orders
where status not in ('pending', 'awaiting_payment', 'paid', 'processing', 'fulfilled', 'cancelled', 'expired', 'refunded', 'failed');
```

```sql
select id, status
from public.digital_inventory
where status not in ('available', 'reserved', 'delivered', 'disabled', 'expired', 'invalid');
```

```sql
select id, status
from public.chain_payment_sessions
where status not in (
  'waiting_payment',
  'submitted',
  'confirming',
  'verified',
  'completing',
  'payment_failed',
  'underpaid',
  'manual_review',
  'paid',
  'rejected',
  'cancelled',
  'expired'
);
```

## 6. Duplicate Data Risks

```sql
select slug, count(*)
from public.categories
group by slug
having count(*) > 1;
```

```sql
select slug, count(*)
from public.products
group by slug
having count(*) > 1;
```

```sql
select user_id, client_request_id, count(*)
from public.orders
where client_request_id is not null
group by user_id, client_request_id
having count(*) > 1;
```

```sql
select chain_id, lower(tx_hash) as tx_hash, count(distinct order_id)
from public.chain_transaction_claims
group by chain_id, lower(tx_hash)
having count(distinct order_id) > 1;
```

```sql
select inventory_id, count(*)
from public.order_deliveries
where inventory_id is not null
group by inventory_id
having count(*) > 1;
```

## 7. Orphan Foreign Key Risks

```sql
select p.id, p.name, p.category_id
from public.products p
left join public.categories c on c.id = p.category_id
where p.category_id is not null and c.id is null;
```

```sql
select oi.id, oi.order_id
from public.order_items oi
left join public.orders o on o.id = oi.order_id
where o.id is null;
```

```sql
select di.id, di.reserved_order_id
from public.digital_inventory di
left join public.orders o on o.id = di.reserved_order_id
where di.reserved_order_id is not null and o.id is null;
```

```sql
select od.id, od.inventory_id
from public.order_deliveries od
left join public.digital_inventory di on di.id = od.inventory_id
where od.inventory_id is not null and di.id is null;
```

## 8. Function Signature Preflight

```sql
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'is_admin',
    'set_updated_at',
    'normalize_order_item_delivery_type',
    'create_order_with_item',
    'release_order_inventory',
    'deliver_digital_order',
    'complete_order_payment',
    'complete_payment_session',
    'claim_bep20_chain_transaction',
    'prepare_bep20_payment_completion',
    'finish_bep20_payment_completion',
    'decide_bep20_manual_review'
  )
order by p.proname, identity_arguments;
```

Blocking rule: if multiple overloads exist for functions that the application calls with named parameters, verify the exact call signature before migration.

## 9. RLS And Policy Preflight

```sql
select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'profiles',
    'categories',
    'products',
    'orders',
    'order_items',
    'order_payments',
    'digital_inventory',
    'order_deliveries',
    'chain_payment_sessions',
    'chain_transactions',
    'chain_transaction_claims',
    'admin_audit_logs'
  )
order by c.relname;
```

```sql
select schemaname, tablename, policyname, permissive, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles',
    'categories',
    'products',
    'orders',
    'order_items',
    'order_payments',
    'digital_inventory',
    'order_deliveries',
    'chain_payment_sessions',
    'chain_transactions',
    'chain_transaction_claims',
    'admin_audit_logs'
  )
order by tablename, policyname;
```

## 10. Trigger Preflight

```sql
select event_object_table, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in (
    'profiles',
    'categories',
    'products',
    'orders',
    'order_items',
    'order_payments',
    'digital_inventory',
    'order_deliveries',
    'chain_payment_sessions',
    'chain_transactions'
  )
order by event_object_table, trigger_name;
```

## 11. Stop Criteria

Stop before migration when any of these are true:

- Required base tables are missing for the batch being executed.
- `public.is_admin()` is missing before admin/RLS migrations.
- Duplicate slugs, duplicate client request IDs, duplicate chain transaction claims, or duplicate delivered inventory rows exist.
- Existing rows contain status values that the next check constraint will reject.
- Function signatures differ from the application call contract.
- A BEP20 transaction is claimed by more than one order.

## 12. Continue Criteria

Continue only when:

- The target database is confirmed as the test project.
- Preflight queries show no blocking duplicate, orphan, or invalid status rows.
- Function signatures match the expected migration stage.
- A backup/export exists for any environment that is not disposable.
