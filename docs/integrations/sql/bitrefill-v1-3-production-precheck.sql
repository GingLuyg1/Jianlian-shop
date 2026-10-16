-- READ-ONLY PRECHECK TEMPLATE. Separate Production read authorization required.
-- Current-schema forward migration only; historical clean replay is unsupported.
-- No row identifiers, customer data, secrets, credentials, or mutation.
-- DB9 candidate SHA256: 90f165aedd242206a68352a00e71eebec68b27cf05e21ab0213a66e033719ce0
-- Frozen canonical V1 fixture fingerprint (not a Production assertion):
-- e036759cd8baa297a4de29c3bf3dc1460bd7959fdc00ebb26a6b7807849193fb
-- Legacy DB4 fingerprint is not reproducible and must NOT be a gate.
-- This older broad template is NOT the DB10 approved query set: it contains
-- additional dirty categories. Use the frozen authoritative parity SQL (five
-- COUNT-only checks) plus bitrefill-v1-3-db10-acl-precheck.sql only after separate
-- authorization. Compare per object, not just aggregate hashes. STOP on drift.
begin transaction read only;

select current_database() as database_name,
       current_user as database_user,
       current_setting('server_version') as postgres_version;

select object_name, to_regclass('public.' || object_name) is not null as exists_now
from (values
  ('supplier_fulfillment_requests'), ('orders'), ('order_items'),
  ('order_deliveries'), ('digital_inventory'), ('digital_delivery_secrets'),
  ('delivery_logs'), ('products'), ('product_skus'),
  ('supplier_purchase_attempts'), ('supplier_purchase_attempt_items'),
  ('supplier_external_orders'), ('supplier_webhook_receipts'),
  ('supplier_reconciliation_evidence')
) as candidate(object_name);

select c.relname as object_name, c.relkind as kind, c.relrowsecurity as rls_enabled,
       has_table_privilege('anon',c.oid,'SELECT') as anon_select,
       has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_select,
       has_table_privilege('service_role',c.oid,'SELECT') as service_select
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in (
  'supplier_fulfillment_requests','orders','order_items','order_deliveries',
  'digital_inventory','digital_delivery_secrets','delivery_logs','products','product_skus')
order by c.relname;

select c.relname as object_name, a.attname as column_name,
       format_type(a.atttypid,a.atttypmod) as data_type, a.attnotnull as not_null,
       pg_get_expr(d.adbin,d.adrelid) as column_default
from pg_class c join pg_namespace n on n.oid=c.relnamespace
join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
where n.nspname='public' and c.relname in (
  'supplier_fulfillment_requests','orders','order_items','order_deliveries',
  'digital_inventory','digital_delivery_secrets','delivery_logs','products','product_skus')
  and a.attname in (
    'id','order_id','order_item_id','order_no','user_id','status','payment_status',
    'delivery_type','delivery_status','quantity','product_snapshot','product_name',
    'unit_price','line_total','supplier','supplier_product_id','supplier_sku',
    'request_id','provider_order_code','stock','delivery_id','content','detail')
order by c.relname,a.attname;

select c.relname as object_name, con.conname,
       pg_get_constraintdef(con.oid) as definition
from pg_constraint con join pg_class c on c.oid=con.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in (
  'supplier_fulfillment_requests','orders','order_items','order_deliveries')
  and con.contype in ('p','u','c','f')
order by c.relname,con.conname;

select i.indexname, i.indexdef from pg_indexes i
where i.schemaname='public' and i.indexname in (
  'order_deliveries_supplier_item_delivered_uidx',
  'supplier_fulfillment_requests_order_item_id_key',
  'supplier_fulfillment_requests_request_id_key')
order by i.indexname;

select p.oid::regprocedure::text as signature, p.prosecdef as security_definer,
       p.proconfig as function_config,
       md5(pg_get_functiondef(p.oid)) as definition_md5
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
  ('admin_evaluate_product_sku_activation','is_admin')
order by signature;

select 'duplicate_order_item_root' as dirty_kind, count(*) as conflicts from (
  select order_item_id from public.supplier_fulfillment_requests
  group by order_item_id having count(*)>1
) s
union all select 'duplicate_logical_request', count(*) from (
  select supplier,request_id from public.supplier_fulfillment_requests
  group by supplier,request_id having count(*)>1
) s
union all select 'duplicate_external_invoice', count(*) from (
  select supplier,provider_order_code from public.supplier_fulfillment_requests
  where provider_order_code is not null
  group by supplier,provider_order_code having count(*)>1
) s
union all select 'orphan_root', count(*) from public.supplier_fulfillment_requests r
  left join public.order_items i on i.id=r.order_item_id where i.id is null
union all select 'invalid_root_state', count(*) from public.supplier_fulfillment_requests
  where status not in ('PENDING','PURCHASING','FULFILLED','FAILED','UNCERTAIN',
    'RECONCILIATION','NEEDS_INPUT','FAILED_VALIDATION')
union all select 'missing_frozen_binding', count(*) from public.supplier_fulfillment_requests
  where supplier='bitrefill' and (
    nullif(btrim(coalesce(supplier_product_id,'')),'') is null or
    nullif(btrim(coalesce(supplier_sku,'')),'') is null)
union all select 'duplicate_delivered_item', count(*) from (
  select order_item_id from public.order_deliveries
  where delivery_type='supplier_delivery' and delivery_status='delivered'
  group by order_item_id having count(*)>1
) s;

commit;
