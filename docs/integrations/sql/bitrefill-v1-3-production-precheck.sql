-- READ-ONLY DRAFT. Do not execute against Production without a separate rollout approval.
-- Run using a read-only transaction and inspect every row before any migration.
begin transaction read only;

select current_database() as database_name,
       current_user as database_user,
       inet_server_addr() as server_address,
       current_setting('server_version') as postgres_version;

select to_regclass('supabase_migrations.schema_migrations') as migration_history,
       to_regclass('public.supplier_fulfillment_requests') as supplier_root,
       to_regclass('public.order_items') as order_items,
       to_regclass('public.order_deliveries') as order_deliveries;

-- A non-null result means an object name conflict or a partially applied rollout.
select object_name, to_regclass('public.' || object_name) as existing_object
from (values
  ('supplier_purchase_attempts'),
  ('supplier_purchase_attempt_items'),
  ('supplier_external_orders'),
  ('supplier_webhook_receipts'),
  ('supplier_reconciliation_evidence')
) as candidate(object_name);

-- Existing roots are unique per order item/request by the base migration. Any
-- result here means schema drift and blocks this candidate migration.
select order_item_id, count(*) as duplicate_count
from public.supplier_fulfillment_requests
group by order_item_id having count(*) > 1;
select supplier, request_id, count(*) as duplicate_count
from public.supplier_fulfillment_requests
group by supplier, request_id having count(*) > 1;
select supplier, provider_order_code, count(*) as duplicate_count
from public.supplier_fulfillment_requests
where provider_order_code is not null
group by supplier, provider_order_code having count(*) > 1;

select r.id as orphan_root_id
from public.supplier_fulfillment_requests as r
left join public.order_items as i on i.id = r.order_item_id
where i.id is null;

select status, count(*) as rows
from public.supplier_fulfillment_requests
where status not in (
  'PENDING','PURCHASING','FULFILLED','FAILED','UNCERTAIN','RECONCILIATION',
  'NEEDS_INPUT','FAILED_VALIDATION'
)
group by status;

-- BLOCK: existing Bitrefill roots must carry their frozen product/package.
select id as missing_binding_root_id
from public.supplier_fulfillment_requests
where supplier = 'bitrefill'
  and (nullif(btrim(coalesce(supplier_product_id, '')), '') is null
       or nullif(btrim(coalesce(supplier_sku, '')), '') is null);

-- Existing Daju provider_order_code is the only pre-V1.3 external child
-- identity. The new child table does not yet exist, so its duplicate check
-- must be performed after migration with the new unique constraint.
select supplier, provider_order_code, count(*) as duplicate_external_child_candidates
from public.supplier_fulfillment_requests
where provider_order_code is not null
group by supplier, provider_order_code having count(*) > 1;

select order_item_id, count(*) as delivered_supplier_rows
from public.order_deliveries
where delivery_type = 'supplier_delivery' and delivery_status = 'delivered'
group by order_item_id having count(*) > 1;

commit;
