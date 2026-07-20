-- Jianlian Shop production digital delivery read-only audit
-- Target project: Jianlian-shop / qvbovrvybirscaurwuov
-- Before each block, manually confirm the Dashboard project name and project ref above.
-- Execute one numbered block at a time. Do not use Run all.
-- This file contains metadata and explicitly scoped business-row SELECT queries only.

-- 01. Resolve the real public table names related to orders, delivery, and digital inventory.
select
  '01-related-tables'::text as query_id,
  table_schema,
  table_name,
  table_type
from information_schema.tables
where table_schema = 'public'
  and (
    table_name in (
      'orders', 'order_items', 'order_deliveries', 'digital_inventory',
      'digital_inventories', 'digital_inventory_items', 'digital_inventory_batches',
      'inventory_reservations', 'digital_delivery_secrets', 'delivery_logs',
      'order_item_delivery_logs', 'payment_sessions', 'chain_payment_sessions'
    )
    or table_name ~* '(deliver|inventory|fulfill|reservation)'
  )
order by table_name;

-- 02. Columns for every real delivery/inventory/order dependency; no row contents are read.
select
  '02-related-columns'::text as query_id,
  table_schema,
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'orders', 'order_items', 'order_deliveries', 'digital_inventory',
    'digital_inventories', 'digital_inventory_items', 'digital_inventory_batches',
    'inventory_reservations', 'digital_delivery_secrets', 'delivery_logs',
    'order_item_delivery_logs', 'payment_sessions', 'chain_payment_sessions'
  )
order by table_name, ordinal_position;

-- 03. Primary keys, foreign keys, unique constraints, and CHECK constraints.
select
  '03-related-constraints'::text as query_id,
  n.nspname as schema_name,
  c.relname as table_name,
  con.conname as constraint_name,
  case con.contype
    when 'p' then 'PRIMARY KEY'
    when 'f' then 'FOREIGN KEY'
    when 'u' then 'UNIQUE'
    when 'c' then 'CHECK'
    when 'x' then 'EXCLUSION'
    else con.contype::text
  end as constraint_type,
  pg_get_constraintdef(con.oid, true) as constraint_definition
from pg_catalog.pg_constraint con
join pg_catalog.pg_class c on c.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'orders', 'order_items', 'order_deliveries', 'digital_inventory',
    'digital_inventories', 'digital_inventory_items', 'digital_inventory_batches',
    'inventory_reservations', 'digital_delivery_secrets', 'delivery_logs',
    'order_item_delivery_logs', 'payment_sessions', 'chain_payment_sessions'
  )
order by c.relname, constraint_type, con.conname;

-- 04. Complete index metadata including uniqueness, indexed columns, and predicates.
select
  '04-related-indexes'::text as query_id,
  ns.nspname as schema_name,
  tbl.relname as table_name,
  idx.relname as index_name,
  ind.indisunique as is_unique,
  ind.indisprimary as is_primary,
  pg_get_indexdef(ind.indexrelid) as index_definition,
  pg_get_expr(ind.indpred, ind.indrelid) as predicate
from pg_catalog.pg_index ind
join pg_catalog.pg_class tbl on tbl.oid = ind.indrelid
join pg_catalog.pg_class idx on idx.oid = ind.indexrelid
join pg_catalog.pg_namespace ns on ns.oid = tbl.relnamespace
where ns.nspname = 'public'
  and tbl.relname in (
    'orders', 'order_items', 'order_deliveries', 'digital_inventory',
    'digital_inventories', 'digital_inventory_items', 'digital_inventory_batches',
    'inventory_reservations', 'digital_delivery_secrets', 'delivery_logs',
    'order_item_delivery_logs', 'payment_sessions', 'chain_payment_sessions'
  )
order by tbl.relname, idx.relname;

-- 05. RLS enablement and force-RLS status.
select
  '05-related-rls'::text as query_id,
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relname in (
    'orders', 'order_items', 'order_deliveries', 'digital_inventory',
    'digital_inventories', 'digital_inventory_items', 'digital_inventory_batches',
    'inventory_reservations', 'digital_delivery_secrets', 'delivery_logs',
    'order_item_delivery_logs', 'payment_sessions', 'chain_payment_sessions'
  )
order by c.relname;

-- 06. Every RLS policy on the relevant tables.
select
  '06-related-policies'::text as query_id,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd as command,
  qual as using_expression,
  with_check as with_check_expression
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename in (
    'orders', 'order_items', 'order_deliveries', 'digital_inventory',
    'digital_inventories', 'digital_inventory_items', 'digital_inventory_batches',
    'inventory_reservations', 'digital_delivery_secrets', 'delivery_logs',
    'order_item_delivery_logs', 'payment_sessions', 'chain_payment_sessions'
  )
order by tablename, policyname;

-- 07. Effective table privileges for application roles; no table rows are read.
select
  '07-related-table-privileges'::text as query_id,
  t.table_schema,
  t.table_name,
  r.role_name,
  has_table_privilege(r.role_name, format('%I.%I', t.table_schema, t.table_name), 'SELECT') as can_select,
  has_table_privilege(r.role_name, format('%I.%I', t.table_schema, t.table_name), 'INSERT') as can_insert,
  has_table_privilege(r.role_name, format('%I.%I', t.table_schema, t.table_name), 'UPDATE') as can_update,
  has_table_privilege(r.role_name, format('%I.%I', t.table_schema, t.table_name), 'DELETE') as can_delete
from information_schema.tables t
cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
where t.table_schema = 'public'
  and t.table_name in (
    'orders', 'order_items', 'order_deliveries', 'digital_inventory',
    'digital_inventories', 'digital_inventory_items', 'digital_inventory_batches',
    'inventory_reservations', 'digital_delivery_secrets', 'delivery_logs',
    'order_item_delivery_logs', 'payment_sessions', 'chain_payment_sessions'
  )
order by t.table_name, r.role_name;

-- 08. Delivery/inventory-related functions, overloads, security attributes, ACL, and definitions.
select
  '08-related-functions'::text as query_id,
  n.nspname as schema_name,
  p.proname as function_name,
  p.oid,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_result(p.oid) as result_type,
  pg_get_userbyid(p.proowner) as owner,
  l.lanname as language,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  p.proparallel as parallel_safety,
  p.proconfig as configuration,
  p.proacl as acl,
  pg_get_functiondef(p.oid) as function_definition,
  pg_get_functiondef(p.oid) ~* 'order_deliveries\s*\.\s*user_id|\bod\s*\.\s*user_id' as directly_references_delivery_user_id
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
join pg_catalog.pg_language l on l.oid = p.prolang
where n.nspname = 'public'
  and p.prokind = 'f'
  and (
    p.proname ~* '(delivery|deliver|inventory|reserve|release|fulfill|digital)'
    or pg_get_functiondef(p.oid) ~* '(order_deliveries|digital_inventory|digital_delivery_secrets)'
  )
order by p.proname, pg_get_function_identity_arguments(p.oid);

-- 09. Effective EXECUTE privileges on the related function overloads.
select
  '09-related-function-permissions'::text as query_id,
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  r.role_name,
  case
    when r.role_name = 'PUBLIC' then exists (
      select 1
      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    )
    else has_function_privilege(r.role_name, p.oid, 'EXECUTE')
  end as can_execute
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
cross join (values ('PUBLIC'), ('anon'), ('authenticated'), ('service_role')) as r(role_name)
where n.nspname = 'public'
  and p.prokind = 'f'
  and (
    p.proname ~* '(delivery|deliver|inventory|reserve|release|fulfill|digital)'
    or pg_get_functiondef(p.oid) ~* '(order_deliveries|digital_inventory|digital_delivery_secrets)'
  )
order by p.proname, pg_get_function_identity_arguments(p.oid), r.role_name;

-- 10. Safe summary for the named production order. No customer, wallet, TxHash, or delivery content is selected.
select
  '10-target-order-summary'::text as query_id,
  id as order_id,
  order_no,
  status,
  payment_status,
  payment_method,
  payment_expires_at,
  expired_at,
  reservation_released_at
from public.orders
where order_no = 'JL202607190954067510';

-- 11. Safe relationship counts for the named order. No session secrets, addresses, hashes, or content are selected.
with target_order as (
  select id
  from public.orders
  where order_no = 'JL202607190954067510'
)
select
  '11-target-order-related-counts'::text as query_id,
  (select count(*) from public.payment_sessions ps join target_order o on o.id = ps.business_id) as payment_session_count,
  (select count(*) from public.chain_payment_sessions cps join target_order o on o.id = cps.order_id) as chain_payment_session_count,
  (select count(*) from public.order_deliveries od join target_order o on o.id = od.order_id) as order_delivery_count,
  (select count(*) from public.digital_inventory di join target_order o on coalesce(di.reserved_order_id, di.order_id) = o.id where di.status = 'reserved') as reserved_inventory_count,
  (select count(*) from public.digital_inventory di join target_order o on di.delivered_order_id = o.id where di.status = 'delivered') as delivered_inventory_count;

-- 12. Safe inventory status summary for the named order. Never select content or content-derived columns.
with target_order as (
  select id
  from public.orders
  where order_no = 'JL202607190954067510'
)
select
  '12-target-order-inventory-status'::text as query_id,
  di.status,
  count(*) as inventory_count,
  min(di.reserved_at) as first_reserved_at,
  max(di.reserved_at) as last_reserved_at,
  min(di.delivered_at) as first_delivered_at,
  max(di.delivered_at) as last_delivered_at,
  min(di.expires_at) as earliest_inventory_expiration
from public.digital_inventory di
join target_order o
  on coalesce(di.reserved_order_id, di.delivered_order_id, di.order_id) = o.id
group by di.status
order by di.status;
