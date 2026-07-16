-- Product SKU compatibility baseline verification.
--
-- Run in a test Supabase database before and after:
--   supabase/migrations/20260710_product_skus_compatibility_baseline.sql
--
-- This script is read-only. It does not modify schema or data.
-- Capture the function_hash rows before and after the migration and compare them.

select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  md5(pg_get_functiondef(p.oid)) as function_hash
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_order_with_item',
    'deliver_digital_order',
    'complete_order_payment',
    'cancel_unpaid_order',
    'expire_unpaid_order',
    'admin_update_order_status'
  )
order by p.proname, identity_arguments;

with expected(table_name) as (
  values
    ('product_option_groups'),
    ('product_option_values'),
    ('product_skus'),
    ('product_sku_values')
)
select
  e.table_name,
  to_regclass('public.' || e.table_name) is not null as exists
from expected e
order by e.table_name;

with expected(table_name, column_name) as (
  values
    ('order_items', 'sku_id'),
    ('order_items', 'sku_code'),
    ('order_items', 'sku_title'),
    ('order_items', 'option_snapshot'),
    ('digital_inventory', 'sku_id'),
    ('order_deliveries', 'sku_id')
)
select
  e.table_name,
  e.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_name is not null as exists
from expected e
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = e.table_name
 and c.column_name = e.column_name
order by e.table_name, e.column_name;

select
  'digital_inventory_batches.sku_id' as check_name,
  case
    when to_regclass('public.digital_inventory_batches') is null then true
    else exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'digital_inventory_batches'
        and column_name = 'sku_id'
    )
  end as ok,
  case
    when to_regclass('public.digital_inventory_batches') is null then 'optional table missing; sku_id correctly skipped'
    else 'optional table exists; sku_id must exist'
  end as note;

with expected(index_name) as (
  values
    ('product_option_groups_product_name_uidx'),
    ('product_option_values_group_name_uidx'),
    ('product_skus_product_code_uidx'),
    ('product_skus_product_combination_uidx'),
    ('product_sku_values_sku_group_uidx'),
    ('product_sku_values_sku_value_uidx'),
    ('product_option_groups_product_sort_idx'),
    ('product_option_values_group_sort_idx'),
    ('product_skus_product_status_sort_idx'),
    ('order_items_sku_idx'),
    ('digital_inventory_product_sku_status_idx'),
    ('order_deliveries_sku_idx')
)
select
  e.index_name,
  i.indexdef is not null as exists,
  i.indexdef
from expected e
left join pg_indexes i on i.schemaname = 'public' and i.indexname = e.index_name
order by e.index_name;

select
  'digital_inventory_batches_product_sku_idx' as index_name,
  case
    when to_regclass('public.digital_inventory_batches') is null then true
    else exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'digital_inventory_batches_product_sku_idx'
    )
  end as ok,
  case
    when to_regclass('public.digital_inventory_batches') is null then 'optional table missing; index correctly skipped'
    else 'optional table exists; index must exist'
  end as note;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'product_option_groups',
    'product_option_values',
    'product_skus',
    'product_sku_values'
  )
order by c.relname;

select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'product_option_groups',
    'product_option_values',
    'product_skus',
    'product_sku_values'
  )
order by tablename, policyname;

select
  table_schema,
  table_name,
  grantee,
  string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'product_option_groups',
    'product_option_values',
    'product_skus',
    'product_sku_values'
  )
  and grantee in ('anon', 'authenticated', 'service_role')
group by table_schema, table_name, grantee
order by table_name, grantee;

select
  trigger_schema,
  event_object_table as table_name,
  trigger_name,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name in (
    'product_option_groups_set_updated_at',
    'product_option_values_set_updated_at',
    'product_skus_set_updated_at',
    'product_option_group_limit'
  )
order by table_name, trigger_name;
