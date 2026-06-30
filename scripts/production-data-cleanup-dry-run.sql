-- Jianlian Shop production data cleanup dry-run.
-- SAFE MODE: this file contains SELECT statements only.
-- Run manually in Supabase SQL Editor after confirming you are in the intended environment.

with keywords(keyword) as (
  values
    ('test'), ('demo'), ('mock'), ('sandbox'), ('example'), ('sample'),
    ('dev'), ('local'), ('localhost'), ('fake'), ('placeholder')
),
suspected_profiles as (
  select p.id
  from public.profiles p
  where exists (
    select 1 from keywords k
    where coalesce(p.email, '') ilike '%' || k.keyword || '%'
       or coalesce(p.display_name, '') ilike '%' || k.keyword || '%'
       or coalesce(p.full_name, '') ilike '%' || k.keyword || '%'
  )
),
suspected_products as (
  select p.id
  from public.products p
  where exists (
    select 1 from keywords k
    where coalesce(p.name, '') ilike '%' || k.keyword || '%'
       or coalesce(p.slug, '') ilike '%' || k.keyword || '%'
       or coalesce(p.short_description, '') ilike '%' || k.keyword || '%'
       or coalesce(p.description, '') ilike '%' || k.keyword || '%'
  )
),
suspected_orders as (
  select o.id
  from public.orders o
  where exists (
    select 1 from keywords k
    where coalesce(o.order_no, '') ilike '%' || k.keyword || '%'
       or coalesce(o.customer_email, '') ilike '%' || k.keyword || '%'
       or coalesce(o.customer_name, '') ilike '%' || k.keyword || '%'
       or coalesce(o.customer_note, '') ilike '%' || k.keyword || '%'
       or coalesce(o.admin_note, '') ilike '%' || k.keyword || '%'
  )
),
suspected_payments as (
  select ps.id
  from public.payment_sessions ps
  where exists (
    select 1 from keywords k
    where coalesce(ps.payment_no, '') ilike '%' || k.keyword || '%'
       or coalesce(ps.provider, '') ilike '%' || k.keyword || '%'
       or coalesce(ps.channel_code, '') ilike '%' || k.keyword || '%'
       or coalesce(ps.provider_order_no, '') ilike '%' || k.keyword || '%'
       or coalesce(ps.provider_transaction_id, '') ilike '%' || k.keyword || '%'
  )
),
suspected_inventory as (
  select di.id
  from public.digital_inventory di
  where exists (
    select 1 from keywords k
    where coalesce(di.batch_no, '') ilike '%' || k.keyword || '%'
       or coalesce(di.remark, '') ilike '%' || k.keyword || '%'
  )
)
select 'profiles' as table_name, count(*) as suspected_count, '需人工核对邮箱、昵称、来源环境' as review_note from suspected_profiles
union all
select 'products', count(*), '需人工核对商品名称、分类、是否已上架' from suspected_products
union all
select 'orders', count(*), '真实订单不得删除；需核对支付和交付链路' from suspected_orders
union all
select 'payment_sessions', count(*), '支付记录需按财务要求保留' from suspected_payments
union all
select 'digital_inventory', count(*), '数字库存不得误删已交付或已预留记录' from suspected_inventory;
