\set ON_ERROR_STOP on
select set_config('request.jwt.claim.role', 'service_role', false);

create or replace function pg_temp.assert_true(value boolean, label text) returns void
language plpgsql as $$ begin if value is not true then raise exception 'ASSERT_FAILED: %', label; end if; end $$;

select pg_temp.assert_true(not has_function_privilege('anon', 'public.admin_bulk_update_product_sku_status(uuid,uuid[],text)', 'EXECUTE'), 'ANON_EXECUTE_REVOKED');
select pg_temp.assert_true(not has_function_privilege('authenticated', 'public.admin_bulk_update_product_sku_status(uuid,uuid[],text)', 'EXECUTE'), 'AUTHENTICATED_EXECUTE_REVOKED');
select pg_temp.assert_true(has_function_privilege('service_role', 'public.admin_bulk_update_product_sku_status(uuid,uuid[],text)', 'EXECUTE'), 'SERVICE_ROLE_EXECUTE_GRANTED');

\set p1 '10000000-0000-4000-8000-000000000001'
\set p2 '10000000-0000-4000-8000-000000000002'

-- Case 1: ten exact rows succeed.
select public.admin_bulk_update_product_sku_status(
  :'p1', array(select id from public.product_skus where product_id = :'p1' order by id), 'sold_out'
) as case_1_result \gset
select pg_temp.assert_true((:'case_1_result'::jsonb->>'updated_count')::int = 10, 'CASE_1_UPDATED_10');

-- Case 2: one missing ID aborts and leaves the first nine unchanged.
update public.product_skus set status = 'active' where product_id = :'p1';
\set ON_ERROR_STOP off
select public.admin_bulk_update_product_sku_status(:'p1', array[
  '20000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000002'::uuid,
  '20000000-0000-4000-8000-000000000003'::uuid, '20000000-0000-4000-8000-000000000004'::uuid,
  '20000000-0000-4000-8000-000000000005'::uuid, '20000000-0000-4000-8000-000000000006'::uuid,
  '20000000-0000-4000-8000-000000000007'::uuid, '20000000-0000-4000-8000-000000000008'::uuid,
  '20000000-0000-4000-8000-000000000009'::uuid, '99999999-0000-4000-8000-000000000999'::uuid
], 'draft');
\if :ERROR
\else
  \echo 'CASE_2_EXPECTED_FAILURE_MISSING'
  \quit 1
\endif
\set ON_ERROR_STOP on
select pg_temp.assert_true((select count(*) = 10 from public.product_skus where product_id = :'p1' and status = 'active'), 'CASE_2_ZERO_WRITES');

-- Case 3: a cross-product ID aborts the complete batch.
\set ON_ERROR_STOP off
select public.admin_bulk_update_product_sku_status(:'p1', array[
  '20000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000002'::uuid,
  '20000000-0000-4000-8000-000000000003'::uuid, '20000000-0000-4000-8000-000000000004'::uuid,
  '20000000-0000-4000-8000-000000000005'::uuid, '20000000-0000-4000-8000-000000000006'::uuid,
  '20000000-0000-4000-8000-000000000007'::uuid, '20000000-0000-4000-8000-000000000008'::uuid,
  '20000000-0000-4000-8000-000000000009'::uuid, '30000000-0000-4000-8000-000000000001'::uuid
], 'draft');
\if :ERROR
\else
  \echo 'CASE_3_EXPECTED_FAILURE_CROSS_PRODUCT'
  \quit 1
\endif
\set ON_ERROR_STOP on
select pg_temp.assert_true((select count(*) = 10 from public.product_skus where product_id = :'p1' and status = 'active'), 'CASE_3_ZERO_WRITES');

-- Cases 4-7: duplicate, oversized, active, and inactive inputs all fail before writes.
\set ON_ERROR_STOP off
select public.admin_bulk_update_product_sku_status(:'p1', array['20000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000001'::uuid], 'draft');
\if :ERROR
\else
  \quit 1
\endif
select public.admin_bulk_update_product_sku_status(:'p1', array(select ('90000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1,101) as generated(i)), 'draft');
\if :ERROR
\else
  \quit 1
\endif
select public.admin_bulk_update_product_sku_status(:'p1', array['20000000-0000-4000-8000-000000000001'::uuid], 'active');
\if :ERROR
\else
  \quit 1
\endif
select public.admin_bulk_update_product_sku_status(:'p1', array['20000000-0000-4000-8000-000000000001'::uuid], 'inactive');
\if :ERROR
\else
  \quit 1
\endif
\set ON_ERROR_STOP on
select pg_temp.assert_true((select count(*) = 10 from public.product_skus where product_id = :'p1' and status = 'active'), 'CASES_4_TO_7_ZERO_WRITES');

-- Case 8: all no-change.
update public.product_skus set status = 'draft' where product_id = :'p1';
select public.admin_bulk_update_product_sku_status(:'p1', array(select id from public.product_skus where product_id = :'p1'), 'draft') as case_8_result \gset
select pg_temp.assert_true((:'case_8_result'::jsonb->>'updated_count')::int = 0 and (:'case_8_result'::jsonb->>'no_change_count')::int = 10, 'CASE_8_NO_CHANGE');

-- Case 9: exact mixed counts and parent summary in the same transaction.
update public.product_skus set status = case when sort_order <= 5 then 'active' else 'draft' end where product_id = :'p1';
select public.admin_bulk_update_product_sku_status(:'p1', array(select id from public.product_skus where product_id = :'p1'), 'draft') as case_9_result \gset
select pg_temp.assert_true((:'case_9_result'::jsonb->>'updated_count')::int = 5 and (:'case_9_result'::jsonb->>'no_change_count')::int = 5, 'CASE_9_MIXED_COUNTS');
select pg_temp.assert_true((select stock = 0 and has_skus from public.products where id = :'p1'), 'CASE_9_PARENT_SUMMARY');

-- Case 10 is represented by Case 2 at execute time: stale preview cannot authorize a missing row.
select 'ADMIN_CATALOG_BULK_STATUS_ATOMICITY_CASES_PASS';
