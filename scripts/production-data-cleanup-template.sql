-- Jianlian Shop production data cleanup template.
-- DANGER: this template is intentionally commented out.
--
-- 必须先备份
-- 必须先执行 dry-run
-- 必须人工核对记录
-- 必须在正确环境执行
-- 必须逐段解除注释
--
-- This file must not be executed as-is. Destructive examples below are intentionally commented.

-- Step 1: create a reviewed candidate table manually after dry-run.
-- create temporary table cleanup_candidates (
--   table_name text not null,
--   id uuid not null,
--   reason text not null,
--   approved_by text not null,
--   approved_at timestamptz not null default now()
-- );

-- Step 2: insert only manually reviewed IDs.
-- insert into cleanup_candidates(table_name, id, reason, approved_by)
-- values
--   ('products', '00000000-0000-0000-0000-000000000000', 'confirmed demo product', 'operator@example.com');

-- Step 3: preview impact before every cleanup step.
-- select table_name, count(*) from cleanup_candidates group by table_name order by table_name;

-- Step 4: clean child records before parent records.
-- The following statements stay commented by default. Remove comments one block at a time only after backup and approval.

-- delete from public.order_deliveries
-- where order_id in (select id from cleanup_candidates where table_name = 'orders');

-- delete from public.order_status_logs
-- where order_id in (select id from cleanup_candidates where table_name = 'orders');

-- delete from public.order_items
-- where order_id in (select id from cleanup_candidates where table_name = 'orders');

-- delete from public.payment_sessions
-- where business_id in (select id from cleanup_candidates where table_name = 'orders');

-- delete from public.orders
-- where id in (select id from cleanup_candidates where table_name = 'orders');

-- delete from public.product_skus
-- where product_id in (select id from cleanup_candidates where table_name = 'products');

-- delete from public.products
-- where id in (select id from cleanup_candidates where table_name = 'products');

-- Digital inventory must be handled separately.
-- Never delete delivered or reserved inventory without a written incident record.
-- update public.digital_inventory
-- set status = 'disabled', remark = coalesce(remark, '') || ' | disabled during production cleanup'
-- where id in (select id from cleanup_candidates where table_name = 'digital_inventory')
--   and status = 'available';
