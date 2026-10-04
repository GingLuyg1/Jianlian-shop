\set ON_ERROR_STOP on
create or replace function pg_temp.assert_true(value boolean, label text) returns void
language plpgsql as $$ begin if value is not true then raise exception 'ASSERT_FAILED: %', label; end if; end $$;

select pg_temp.assert_true(not has_function_privilege('anon', 'public.admin_bulk_activate_product_skus(uuid,uuid[])', 'EXECUTE'), 'ACTIVATION_ANON_EXECUTE_REVOKED');
select pg_temp.assert_true(not has_function_privilege('authenticated', 'public.admin_bulk_activate_product_skus(uuid,uuid[])', 'EXECUTE'), 'ACTIVATION_AUTH_EXECUTE_REVOKED');
select pg_temp.assert_true(has_function_privilege('service_role', 'public.admin_bulk_activate_product_skus(uuid,uuid[])', 'EXECUTE'), 'ACTIVATION_SERVICE_EXECUTE_GRANTED');

\set p1 '10000000-0000-4000-8000-000000000001'
\set p2 '10000000-0000-4000-8000-000000000002'

-- JS/SQL readiness parity controls: exact local inventory and exact supplier metadata.
select pg_temp.assert_true(
  (public.admin_evaluate_product_sku_activation('automatic', 'automatic', 1, '{}'::jsonb, 1)->>'ready')::boolean,
  'PARITY_LOCAL_READY'
);
select pg_temp.assert_true(
  not (public.admin_evaluate_product_sku_activation('automatic', 'automatic', 1, '{}'::jsonb, 0)->>'ready')::boolean
  and public.admin_evaluate_product_sku_activation('automatic', 'automatic', 1, '{}'::jsonb, 0)->'reasons' ? 'LOCAL_INVENTORY_EMPTY',
  'PARITY_LOCAL_EMPTY_BLOCKED'
);
select pg_temp.assert_true(
  (public.admin_evaluate_product_sku_activation('automatic', 'automatic', 7, '{"fulfillment_source":"supplier","supplier":"daju","supplier_product_id":15,"supplier_sku":"13","supplier_inputs_mapping":{},"supplier_max_unit_cost":"8.50","supplier_stock_snapshot":7,"supplier_stock_sync_status":"synced","supplier_stock_last_success_at":"2026-10-01T00:00:00Z","supplier_stock_stale":false}'::jsonb, 0)->>'ready')::boolean,
  'PARITY_SUPPLIER_READY'
);
select pg_temp.assert_true(
  not (public.admin_evaluate_product_sku_activation('automatic', 'automatic', 7, '{"fulfillment_source":"supplier","supplier":"daju","supplier_product_id":15,"supplier_sku":"13","supplier_inputs_mapping":{},"supplier_max_unit_cost":"8.50","supplier_stock_snapshot":7,"supplier_stock_sync_status":"synced","supplier_stock_last_success_at":"2026-10-01T00:00:00Z","supplier_stock_stale":true}'::jsonb, 0)->>'ready')::boolean,
  'PARITY_SUPPLIER_STALE_BLOCKED'
);
select pg_temp.assert_true(
  (public.admin_evaluate_product_sku_activation('manual', null, 0, '{"inventory_state":"requires_verification"}'::jsonb, 0)->>'ready')::boolean,
  'PARITY_MANUAL_GUARD_NOT_REQUIRED'
);

-- Case A: Apple-style batch stays fully blocked and unchanged.
delete from public.digital_inventory where product_id = :'p1';
update public.product_skus
set status='draft', stock=0, metadata='{"inventory_state":"requires_verification"}'::jsonb
where product_id=:'p1';
select public.admin_bulk_activate_product_skus(:'p1', array(select id from public.product_skus where product_id=:'p1' order by id)) as apple_result \gset
select pg_temp.assert_true(not (:'apple_result'::jsonb->>'ok')::boolean, 'APPLE_BLOCKED');
select pg_temp.assert_true((:'apple_result'::jsonb->>'blocked_count')::int = 10 and (:'apple_result'::jsonb->>'updated_count')::int = 0, 'APPLE_ZERO_WRITES');
select pg_temp.assert_true((select count(*)=10 from public.product_skus where product_id=:'p1' and status='draft'), 'APPLE_ALL_DRAFT');

-- Case B: exact local inventory succeeds, including active no-change rows.
update public.product_skus set status=case when sort_order <= 3 then 'active' else 'draft' end, stock=1, metadata='{}'::jsonb where product_id=:'p1';
insert into public.digital_inventory(id, product_id, sku_id, status)
select ('40000000-0000-4000-8000-' || lpad(sort_order::text,12,'0'))::uuid, product_id, id, 'available'
from public.product_skus where product_id=:'p1';
select public.admin_bulk_activate_product_skus(:'p1', array(select id from public.product_skus where product_id=:'p1' order by id)) as local_result \gset
select pg_temp.assert_true((:'local_result'::jsonb->>'ok')::boolean, 'LOCAL_BATCH_SUCCESS');
select pg_temp.assert_true((:'local_result'::jsonb->>'updated_count')::int=7 and (:'local_result'::jsonb->>'no_change_count')::int=3, 'LOCAL_MIXED_COUNTS');
select pg_temp.assert_true((select count(*)=10 from public.product_skus where product_id=:'p1' and status='active'), 'LOCAL_ALL_ACTIVE');
select pg_temp.assert_true((select has_skus and stock=10 and price=1 from public.products where id=:'p1'), 'LOCAL_SUMMARY_ATOMIC');

-- Case C: nine ready and one blocked means zero activation writes and unchanged parent summary.
update public.product_skus set status='draft' where product_id=:'p1';
update public.products set stock=777, price=99 where id=:'p1';
update public.digital_inventory set status='reserved' where sku_id='20000000-0000-4000-8000-000000000010';
select public.admin_bulk_activate_product_skus(:'p1', array(select id from public.product_skus where product_id=:'p1' order by id)) as mixed_result \gset
select pg_temp.assert_true(not (:'mixed_result'::jsonb->>'ok')::boolean and (:'mixed_result'::jsonb->>'blocked_count')::int=1, 'MIXED_BLOCKED');
select pg_temp.assert_true((select count(*)=10 from public.product_skus where product_id=:'p1' and status='draft'), 'MIXED_ZERO_ACTIVATIONS');
select pg_temp.assert_true((select stock=777 and price=99 from public.products where id=:'p1'), 'MIXED_PARENT_UNCHANGED');

-- Case D: parent product evidence never substitutes for exact SKU evidence.
update public.product_skus set status='draft', stock=1, metadata='{}'::jsonb where id='20000000-0000-4000-8000-000000000001';
delete from public.digital_inventory where sku_id='20000000-0000-4000-8000-000000000001';
select public.admin_bulk_activate_product_skus(:'p1', array['20000000-0000-4000-8000-000000000001'::uuid]) as parent_result \gset
select pg_temp.assert_true(not (:'parent_result'::jsonb->>'ok')::boolean and (:'parent_result'::jsonb->>'updated_count')::int=0, 'PARENT_EVIDENCE_REJECTED');

-- Case E: exact supplier metadata is sufficient without external calls.
update public.product_skus set status='draft', stock=7, metadata='{"fulfillment_source":"supplier","supplier":"daju","supplier_product_id":15,"supplier_sku":"13","supplier_inputs_mapping":{},"supplier_max_unit_cost":"8.50","supplier_stock_snapshot":7,"supplier_stock_sync_status":"synced","supplier_stock_last_success_at":"2026-10-01T00:00:00Z","supplier_stock_stale":false}'::jsonb where id='20000000-0000-4000-8000-000000000001';
select public.admin_bulk_activate_product_skus(:'p1', array['20000000-0000-4000-8000-000000000001'::uuid]) as supplier_result \gset
select pg_temp.assert_true((:'supplier_result'::jsonb->>'ok')::boolean and (:'supplier_result'::jsonb->>'updated_count')::int=1, 'SUPPLIER_EXACT_SUCCESS');

-- Case F: already-active remains no-change even if readiness later degrades.
update public.product_skus set status='active', stock=0, metadata='{"inventory_state":"requires_verification"}'::jsonb where id='20000000-0000-4000-8000-000000000001';
select public.admin_bulk_activate_product_skus(:'p1', array['20000000-0000-4000-8000-000000000001'::uuid]) as no_change_result \gset
select pg_temp.assert_true((:'no_change_result'::jsonb->>'ok')::boolean and (:'no_change_result'::jsonb->>'updated_count')::int=0 and (:'no_change_result'::jsonb->>'no_change_count')::int=1, 'ALREADY_ACTIVE_NO_CHANGE');

-- Case G: wrong-product identity aborts before any activation.
update public.product_skus set status='draft' where product_id=:'p1';
\set ON_ERROR_STOP off
select public.admin_bulk_activate_product_skus(:'p1', array['20000000-0000-4000-8000-000000000001'::uuid, '30000000-0000-4000-8000-000000000001'::uuid]);
\if :ERROR
\else
  \echo 'ACTIVATION_WRONG_PRODUCT_EXPECTED_FAILURE_MISSING'
  \quit 1
\endif
\set ON_ERROR_STOP on
select pg_temp.assert_true((select count(*)=10 from public.product_skus where product_id=:'p1' and status='draft'), 'WRONG_PRODUCT_ZERO_WRITES');

select 'ADMIN_CATALOG_BULK_ACTIVATION_ATOMICITY_CASES_PASS';
