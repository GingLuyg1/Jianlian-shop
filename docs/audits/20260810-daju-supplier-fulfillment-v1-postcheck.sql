-- READ-ONLY / NO BUSINESS DATA MUTATION
begin;
set transaction read only;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

select
  to_regclass('public.supplier_fulfillment_requests') is not null as request_table_exists,
  to_regprocedure('public.claim_daju_supplier_fulfillment(uuid,uuid,text,bigint,text,text)') is not null as claim_rpc_exists,
  to_regprocedure('public.record_daju_supplier_fulfillment_outcome(uuid,uuid,text,uuid,text,boolean,text,text,text,numeric,numeric,text)') is not null as outcome_rpc_exists,
  position(
    'supplier_fulfillment_requests' in coalesce(pg_catalog.pg_get_functiondef(to_regprocedure('public.claim_daju_supplier_fulfillment(uuid,uuid,text,bigint,text,text)'), '')
  ) > 0 as claim_uses_durable_request,
  position(
    'digital_delivery_secrets' in coalesce(pg_catalog.pg_get_functiondef(to_regprocedure('public.record_daju_supplier_fulfillment_outcome(uuid,uuid,text,uuid,text,boolean,text,text,text,numeric,numeric,text)'), '')
  ) > 0 as outcome_uses_existing_secret_boundary,
  position(
    'fulfillment_source' in coalesce(pg_catalog.pg_get_functiondef(to_regprocedure('public.deliver_digital_order(uuid,text)'), '')
  ) > 0 as local_inventory_excludes_supplier_items,
  position(
    'supplier_binding' in coalesce(pg_catalog.pg_get_functiondef(to_regprocedure('public.create_order_with_item(uuid,integer,text,text,text,text,jsonb,uuid,text,text)'), '')
  ) > 0 as order_creation_snapshots_supplier_binding;

select case
  when to_regclass('public.supplier_fulfillment_requests') is null then 'BLOCKED'
  when to_regprocedure('public.claim_daju_supplier_fulfillment(uuid,uuid,text,bigint,text,text)') is null then 'BLOCKED'
  when to_regprocedure('public.record_daju_supplier_fulfillment_outcome(uuid,uuid,text,uuid,text,boolean,text,text,text,numeric,numeric,text)') is null then 'BLOCKED'
  when pg_catalog.has_function_privilege('anon','public.claim_daju_supplier_fulfillment(uuid,uuid,text,bigint,text,text)','EXECUTE') then 'BLOCKED'
  when pg_catalog.has_function_privilege('authenticated','public.claim_daju_supplier_fulfillment(uuid,uuid,text,bigint,text,text)','EXECUTE') then 'BLOCKED'
  when not pg_catalog.has_function_privilege('service_role','public.claim_daju_supplier_fulfillment(uuid,uuid,text,bigint,text,text)','EXECUTE') then 'BLOCKED'
  else 'PASS'
end as assessment;

rollback;
