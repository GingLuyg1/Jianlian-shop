-- Run this block before 20260623_digital_inventory_batches.sql.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'digital_inventory'
order by ordinal_position;

select status, count(*) as item_count
from public.digital_inventory
group by status
order by status;

select
  to_regclass('public.digital_inventory_batches') as batches_table_before,
  to_regclass('public.order_deliveries') as order_deliveries_table,
  to_regclass('public.delivery_logs') as delivery_logs_table;

-- Run this block after 20260623_digital_inventory_batches.sql.
select to_regclass('public.digital_inventory_batches') as batches_table_after;

select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('digital_inventory', 'digital_inventory_batches')
order by table_name, ordinal_position;

select
  to_regprocedure('public.refresh_digital_inventory_batch_counts(uuid)') as refresh_batch_counts,
  to_regprocedure('public.sync_product_available_stock(uuid)') as sync_product_stock,
  to_regprocedure('public.admin_list_digital_inventory_batches(text,text,integer,integer)') as list_batches,
  to_regprocedure('public.admin_disable_digital_inventory_batch(uuid,text)') as disable_batch,
  to_regprocedure('public.admin_restore_digital_inventory_item(uuid,text)') as restore_item;

select
  c.conname as constraint_name,
  c.contype as constraint_type,
  c.convalidated as is_validated
from pg_constraint c
where c.conrelid in (
  'public.digital_inventory'::regclass,
  'public.digital_inventory_batches'::regclass
)
order by c.conrelid::regclass::text, c.conname;
