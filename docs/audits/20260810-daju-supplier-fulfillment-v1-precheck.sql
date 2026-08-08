-- READ-ONLY / NO BUSINESS DATA MUTATION
begin;
set transaction read only;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

with required_objects(name, present) as (
  values
    ('orders', to_regclass('public.orders') is not null),
    ('order_items', to_regclass('public.order_items') is not null),
    ('products', to_regclass('public.products') is not null),
    ('product_skus', to_regclass('public.product_skus') is not null),
    ('order_deliveries', to_regclass('public.order_deliveries') is not null),
    ('digital_delivery_secrets', to_regclass('public.digital_delivery_secrets') is not null),
    ('deliver_digital_order', to_regprocedure('public.deliver_digital_order(uuid,text)') is not null),
    ('create_order_with_item', to_regprocedure('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)') is not null)
)
select name, present from required_objects order by name;

select
  count(*) filter (where metadata->>'fulfillment_source' = 'supplier' and metadata->>'supplier' = 'daju') as daju_product_binding_count,
  count(*) filter (
    where metadata->>'fulfillment_source' = 'supplier' and metadata->>'supplier' = 'daju'
      and coalesce(metadata->>'supplier_product_id','') !~ '^[1-9][0-9]*$'
  ) as invalid_daju_product_binding_count
from public.products;

select case
  when to_regclass('public.supplier_fulfillment_requests') is not null then 'BLOCKED_ALREADY_PRESENT'
  when to_regprocedure('public.deliver_digital_order(uuid,text)') is null then 'BLOCKED_DEPENDENCY_MISSING'
  when to_regprocedure('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)') is null then 'BLOCKED_DEPENDENCY_MISSING'
  else 'PASS_CANDIDATE'
end as assessment;

rollback;
