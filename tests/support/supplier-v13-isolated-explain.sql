-- LOCAL DISPOSABLE POSTGRES ONLY. 1000 synthetic rows; rolled back after EXPLAIN.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_database() not in ('jianlian_bitrefill_v13_test', 'jianlian_bitrefill_v13_db2')
     or inet_server_addr() is distinct from '127.0.0.1'::inet then
    raise exception 'V13_ISOLATED_DATABASE_GUARD_FAILED';
  end if;
end $$;

insert into public.order_items(id)
select ('a0000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid
from generate_series(1,1000) as g(i);
insert into public.supplier_fulfillment_requests
  (id,order_item_id,supplier,supplier_product_id,supplier_sku,request_id,status)
select ('a1000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
       ('a0000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
       'bitrefill','perf-product','perf-package','v13-perf-root-' || i,'PURCHASING'
from generate_series(1,1000) as g(i);
insert into public.supplier_purchase_attempts
  (id,supplier,logical_request_key,semantic_request_hash,status,submit_started_at,external_invoice_id)
select ('a2000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
       'bitrefill','v13-perf-' || i,repeat('c',64),'EXTERNAL_CREATED',now(),'v13-perf-invoice-' || i
from generate_series(1,1000) as g(i);
insert into public.supplier_purchase_attempt_items
  (id,attempt_id,fulfillment_request_id,order_item_id,unit_index,frozen_product_id,
   frozen_package_id,frozen_currency,quoted_unit_cost,max_unit_cost)
select ('a3000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
       ('a2000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
       ('a1000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
       ('a0000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
       1,'perf-product','perf-package','USD',9.5,10
from generate_series(1,1000) as g(i);
insert into public.supplier_external_orders
  (id,attempt_id,attempt_item_id,supplier,external_order_id,normalized_status)
select ('a4000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
       ('a2000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
       ('a3000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
       'bitrefill','v13-perf-child-' || i,'PENDING'
from generate_series(1,1000) as g(i);
insert into public.supplier_webhook_receipts(supplier,event_fingerprint)
select 'bitrefill',lpad(to_hex(i),64,'0')
from generate_series(1,1000) as g(i);

analyze public.supplier_purchase_attempts;
analyze public.supplier_external_orders;
analyze public.supplier_webhook_receipts;

\echo LOGICAL_PURCHASE_LOOKUP
explain (analyze, buffers) select id from public.supplier_purchase_attempts
where supplier='bitrefill' and logical_request_key='v13-perf-999';
\echo EXTERNAL_INVOICE_LOOKUP
explain (analyze, buffers) select id from public.supplier_purchase_attempts
where supplier='bitrefill' and external_invoice_id='v13-perf-invoice-999';
\echo EXTERNAL_ORDER_LOOKUP
explain (analyze, buffers) select id from public.supplier_external_orders
where supplier='bitrefill' and external_order_id='v13-perf-child-999';
\echo PENDING_RECONCILIATION_LOOKUP
explain (analyze, buffers) select id from public.supplier_purchase_attempts
where supplier='bitrefill' and status='EXTERNAL_CREATED'
order by updated_at, id limit 20;
\echo WEBHOOK_DEDUPE_LOOKUP
explain (analyze, buffers) select id from public.supplier_webhook_receipts
where supplier='bitrefill' and event_fingerprint=lpad(to_hex(999),64,'0');
rollback;
