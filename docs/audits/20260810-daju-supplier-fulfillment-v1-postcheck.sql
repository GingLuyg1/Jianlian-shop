-- READ-ONLY / NO BUSINESS DATA MUTATION
begin;
set transaction read only;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

with function_state as (
  select
    coalesce(pg_catalog.pg_get_functiondef(to_regprocedure('public.deliver_digital_order(uuid,text)')), '') as deliver_definition,
    coalesce(pg_catalog.pg_get_functiondef(to_regprocedure('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)')), '') as create_definition,
    coalesce(pg_catalog.pg_get_functiondef(to_regprocedure('public.claim_daju_supplier_fulfillment(uuid,uuid,text,bigint,text,text)')), '') as claim_definition,
    coalesce(pg_catalog.pg_get_functiondef(to_regprocedure('public.record_daju_supplier_fulfillment_outcome(uuid,uuid,text,uuid,text,boolean,text,text,text,numeric,numeric,text)')), '') as outcome_definition
)
select
  to_regclass('public.supplier_fulfillment_requests') is not null as request_table_exists,
  to_regprocedure('public.claim_daju_supplier_fulfillment(uuid,uuid,text,bigint,text,text)') is not null as claim_rpc_exists,
  to_regprocedure('public.record_daju_supplier_fulfillment_outcome(uuid,uuid,text,uuid,text,boolean,text,text,text,numeric,numeric,text)') is not null as outcome_rpc_exists,
  position('supplier_fulfillment_requests' in claim_definition) > 0 as claim_uses_durable_request,
  position('digital_delivery_secrets' in outcome_definition) > 0 as outcome_uses_existing_secret_boundary,
  position('order_items.product_snapshot' in deliver_definition) > 0
    and position('supplier_binding' in deliver_definition) > 0
    and position('supplier_product.metadata' in deliver_definition) = 0
    and position('supplier_sku.metadata' in deliver_definition) = 0 as local_inventory_uses_snapshot_only,
  position('if p_sku_id is not null then' in create_definition) > 0
    and position('v_supplier_product_id := v_product.metadata' in create_definition) > 0
    and position('supplier_binding' in create_definition) > 0 as order_creation_has_explicit_sku_branches,
  coalesce((select relrowsecurity from pg_catalog.pg_class where oid = to_regclass('public.supplier_fulfillment_requests')), false)
    as request_table_rls_enabled,
  exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.supplier_fulfillment_requests') and contype = 'u'
      and pg_catalog.pg_get_constraintdef(oid) = 'UNIQUE (order_item_id)'
  ) as order_item_unique,
  exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.supplier_fulfillment_requests') and contype = 'u'
      and pg_catalog.pg_get_constraintdef(oid) = 'UNIQUE (request_id)'
  ) as request_id_unique,
  (select count(*) from public.supplier_fulfillment_requests) as request_count_after_migration
from function_state;

with function_state as (
  select
    coalesce(pg_catalog.pg_get_functiondef(to_regprocedure('public.deliver_digital_order(uuid,text)')), '') as deliver_definition,
    coalesce(pg_catalog.pg_get_functiondef(to_regprocedure('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)')), '') as create_definition
)
select case
  when to_regclass('public.supplier_fulfillment_requests') is null then 'BLOCKED'
  when to_regprocedure('public.claim_daju_supplier_fulfillment(uuid,uuid,text,bigint,text,text)') is null then 'BLOCKED'
  when to_regprocedure('public.record_daju_supplier_fulfillment_outcome(uuid,uuid,text,uuid,text,boolean,text,text,text,numeric,numeric,text)') is null then 'BLOCKED'
  when pg_catalog.has_function_privilege('anon','public.claim_daju_supplier_fulfillment(uuid,uuid,text,bigint,text,text)','EXECUTE') then 'BLOCKED'
  when pg_catalog.has_function_privilege('authenticated','public.claim_daju_supplier_fulfillment(uuid,uuid,text,bigint,text,text)','EXECUTE') then 'BLOCKED'
  when not pg_catalog.has_function_privilege('service_role','public.claim_daju_supplier_fulfillment(uuid,uuid,text,bigint,text,text)','EXECUTE') then 'BLOCKED'
  when pg_catalog.has_function_privilege('anon','public.record_daju_supplier_fulfillment_outcome(uuid,uuid,text,uuid,text,boolean,text,text,text,numeric,numeric,text)','EXECUTE') then 'BLOCKED'
  when pg_catalog.has_function_privilege('authenticated','public.record_daju_supplier_fulfillment_outcome(uuid,uuid,text,uuid,text,boolean,text,text,text,numeric,numeric,text)','EXECUTE') then 'BLOCKED'
  when not pg_catalog.has_function_privilege('service_role','public.record_daju_supplier_fulfillment_outcome(uuid,uuid,text,uuid,text,boolean,text,text,text,numeric,numeric,text)','EXECUTE') then 'BLOCKED'
  when pg_catalog.has_table_privilege('anon','public.supplier_fulfillment_requests','SELECT,INSERT,UPDATE,DELETE') then 'BLOCKED'
  when pg_catalog.has_table_privilege('authenticated','public.supplier_fulfillment_requests','SELECT,INSERT,UPDATE,DELETE') then 'BLOCKED'
  when not pg_catalog.has_table_privilege('service_role','public.supplier_fulfillment_requests','SELECT,INSERT,UPDATE') then 'BLOCKED'
  when not coalesce((select relrowsecurity from pg_catalog.pg_class where oid = to_regclass('public.supplier_fulfillment_requests')), false) then 'BLOCKED'
  when not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.supplier_fulfillment_requests') and contype = 'u'
      and pg_catalog.pg_get_constraintdef(oid) = 'UNIQUE (order_item_id)'
  ) then 'BLOCKED'
  when not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.supplier_fulfillment_requests') and contype = 'u'
      and pg_catalog.pg_get_constraintdef(oid) = 'UNIQUE (request_id)'
  ) then 'BLOCKED'
  when position('order_items.product_snapshot' in deliver_definition) = 0 then 'BLOCKED'
  when position('supplier_product.metadata' in deliver_definition) > 0
    or position('supplier_sku.metadata' in deliver_definition) > 0 then 'BLOCKED'
  when position('if p_sku_id is not null then' in create_definition) = 0 then 'BLOCKED'
  when (select count(*) from public.supplier_fulfillment_requests) <> 0 then 'BLOCKED'
  else 'PASS'
end as assessment
from function_state;

rollback;
