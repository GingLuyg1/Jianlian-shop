-- LOCAL DISPOSABLE POSTGRES ONLY. This covers DDL invariants, not purchase RPCs.
\set ON_ERROR_STOP on
begin;

do $$
declare
  v_table text;
begin
  if current_database() not in ('jianlian_bitrefill_v13_test', 'jianlian_bitrefill_v13_db2')
     or inet_server_addr() is distinct from '127.0.0.1'::inet then
    raise exception 'V13_ISOLATED_DATABASE_GUARD_FAILED';
  end if;
  foreach v_table in array array[
    'supplier_purchase_attempts','supplier_purchase_attempt_items',
    'supplier_external_orders','supplier_webhook_receipts',
    'supplier_reconciliation_evidence'
  ] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || v_table)::regclass) then
      raise exception 'RLS_NOT_ENABLED: %', v_table;
    end if;
    if has_table_privilege('anon', 'public.' || v_table, 'SELECT')
       or has_table_privilege('anon', 'public.' || v_table, 'INSERT')
       or has_table_privilege('authenticated', 'public.' || v_table, 'SELECT')
       or has_table_privilege('authenticated', 'public.' || v_table, 'INSERT')
       or not has_table_privilege('service_role', 'public.' || v_table, 'SELECT')
       or has_table_privilege('service_role', 'public.' || v_table, 'INSERT') then
      raise exception 'ACL_MISMATCH: %', v_table;
    end if;
  end loop;
end $$;

insert into public.order_items(id)
select ('90000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid
from generate_series(1,21) as g(i);
insert into public.supplier_fulfillment_requests
  (id,order_item_id,supplier,supplier_product_id,supplier_sku,request_id,status)
select ('91000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
       ('90000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
       'bitrefill','fixture-product','fixture-fixed-package','v13-item-' || i,'PURCHASING'
from generate_series(1,21) as g(i);

insert into public.supplier_purchase_attempts
  (id,supplier,logical_request_key,semantic_request_hash,status,submit_started_at,external_invoice_id)
values
  ('92000000-0000-4000-8000-000000000001','bitrefill','v13-batch-1',repeat('a',64),'EXTERNAL_CREATED',now(),'invoice-1'),
  ('92000000-0000-4000-8000-000000000002','bitrefill','v13-batch-2',repeat('b',64),'EXTERNAL_CREATED',now(),'invoice-2');

insert into public.supplier_purchase_attempt_items
  (id,attempt_id,fulfillment_request_id,order_item_id,unit_index,frozen_product_id,
   frozen_package_id,frozen_currency,frozen_face_value,quoted_unit_cost,max_unit_cost)
select ('93000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
       case when i <= 20 then '92000000-0000-4000-8000-000000000001'::uuid
            else '92000000-0000-4000-8000-000000000002'::uuid end,
       ('91000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
       ('90000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid,
       1,'fixture-product','fixture-fixed-package','USD','10',9.5,10
from generate_series(1,21) as g(i);

do $$
begin
  if (select count(*) from public.supplier_purchase_attempt_items where attempt_id='92000000-0000-4000-8000-000000000001') <> 20
     or (select count(*) from public.supplier_purchase_attempt_items where attempt_id='92000000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'SPLIT_20_1_FAILED';
  end if;
end $$;

insert into public.supplier_external_orders
  (attempt_id,attempt_item_id,supplier,external_order_id,normalized_status)
values
  ('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','bitrefill','child-a','DELIVERED'),
  ('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000002','bitrefill','child-b','PENDING');

do $$
begin
  if (select count(*) from public.supplier_external_orders
      where attempt_id='92000000-0000-4000-8000-000000000001'
        and normalized_status='DELIVERED') <> 1
     or (select count(*) from public.supplier_external_orders
         where attempt_id='92000000-0000-4000-8000-000000000001'
           and normalized_status='PENDING') <> 1 then
    raise exception 'PARTIAL_CHILD_STATE_FAILED';
  end if;
  begin
    insert into public.supplier_purchase_attempts(supplier,logical_request_key,semantic_request_hash)
    values('bitrefill','v13-batch-1',repeat('c',64));
    raise exception 'DUPLICATE_LOGICAL_REQUEST_ACCEPTED';
  exception when unique_violation then null;
  end;
  begin
    insert into public.supplier_purchase_attempts
      (supplier,logical_request_key,semantic_request_hash,status,submit_started_at,external_invoice_id)
    values('bitrefill','v13-batch-3',repeat('c',64),'EXTERNAL_CREATED',now(),'invoice-1');
    raise exception 'DUPLICATE_EXTERNAL_INVOICE_ACCEPTED';
  exception when unique_violation then null;
  end;
  begin
    insert into public.supplier_external_orders
      (attempt_id,attempt_item_id,supplier,external_order_id,normalized_status)
    values('92000000-0000-4000-8000-000000000001',
           '93000000-0000-4000-8000-000000000003','bitrefill','child-a','PENDING');
    raise exception 'DUPLICATE_EXTERNAL_CHILD_ACCEPTED';
  exception when unique_violation then null;
  end;
  begin
    insert into public.supplier_purchase_attempt_items
      (attempt_id,fulfillment_request_id,order_item_id,unit_index,frozen_product_id,
       frozen_package_id,frozen_currency,quoted_unit_cost,max_unit_cost)
    values('92000000-0000-4000-8000-000000000002',
           '91000000-0000-4000-8000-000000000001',
           '90000000-0000-4000-8000-000000000001',1,'fixture-product',
           'fixture-fixed-package','USD',9.5,10);
    raise exception 'DUPLICATE_FROZEN_UNIT_ACCEPTED';
  exception when unique_violation then null;
  end;
  begin
    insert into public.supplier_purchase_attempt_items
      (attempt_id,fulfillment_request_id,order_item_id,unit_index,frozen_product_id,
       frozen_package_id,frozen_currency,quoted_unit_cost,max_unit_cost)
    values('92000000-0000-4000-8000-000000000001',
           '91000000-0000-4000-8000-000000000021',
           '90000000-0000-4000-8000-000000000021',2,'fixture-product',
           'fixture-fixed-package','USD',9.5,10);
    raise exception 'LIMIT_ACCEPTED';
  exception when others then
    if sqlerrm <> 'SUPPLIER_PURCHASE_INVOICE_UNIT_LIMIT' then raise; end if;
  end;
  begin
    insert into public.supplier_purchase_attempt_items
      (attempt_id,fulfillment_request_id,order_item_id,unit_index,frozen_product_id,
       frozen_package_id,frozen_currency,quoted_unit_cost,max_unit_cost)
    values('92000000-0000-4000-8000-000000000002',
           '91000000-0000-4000-8000-000000000021',
           '90000000-0000-4000-8000-000000000021',2,'drifted-product',
           'fixture-fixed-package','USD',9.5,10);
    raise exception 'FROZEN_BINDING_DRIFT_ACCEPTED';
  exception when others then
    if sqlerrm <> 'SUPPLIER_PURCHASE_ROOT_MISMATCH' then raise; end if;
  end;
  begin
    insert into public.supplier_external_orders
      (attempt_id,attempt_item_id,supplier,external_order_id,normalized_status)
    values('92000000-0000-4000-8000-000000000002',
           '93000000-0000-4000-8000-000000000001','bitrefill','misassigned-child','PENDING');
    raise exception 'EXTERNAL_CHILD_MISASSIGNMENT_ACCEPTED';
  exception when others then
    if sqlerrm <> 'SUPPLIER_EXTERNAL_ORDER_ASSIGNMENT_MISMATCH' then raise; end if;
  end;
end $$;

insert into public.supplier_webhook_receipts(supplier,event_fingerprint,external_invoice_id)
values ('bitrefill',repeat('d',64),'invoice-1');
insert into public.supplier_webhook_receipts(supplier,event_fingerprint,external_invoice_id)
values ('bitrefill',repeat('d',64),'invoice-1') on conflict do nothing;
do $$ begin
  if (select count(*) from public.supplier_webhook_receipts
      where supplier='bitrefill' and event_fingerprint=repeat('d',64)) <> 1 then
    raise exception 'WEBHOOK_REPLAY_DEDUPE_FAILED';
  end if;
end $$;

select 'V13_ISOLATED_DDL_CONSTRAINTS_PASS' as result;
rollback;
