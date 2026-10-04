\set ON_ERROR_STOP on

create or replace function pg_temp.assert_workspace(value boolean, label text) returns void
language plpgsql as $$ begin if value is not true then raise exception 'ASSERT_FAILED: %', label; end if; end $$;

select pg_temp.assert_workspace(not has_function_privilege('anon', 'public.admin_save_product_sku_workspace(uuid,jsonb)', 'EXECUTE'), 'WORKSPACE_ANON_REVOKED');
select pg_temp.assert_workspace(not has_function_privilege('authenticated', 'public.admin_save_product_sku_workspace(uuid,jsonb)', 'EXECUTE'), 'WORKSPACE_AUTH_REVOKED');
select pg_temp.assert_workspace(has_function_privilege('service_role', 'public.admin_save_product_sku_workspace(uuid,jsonb)', 'EXECUTE'), 'WORKSPACE_SERVICE_ROLE_GRANTED');

\set workspace_product '10000000-0000-4000-8000-000000000003'
\set failure_product '10000000-0000-4000-8000-000000000004'
insert into public.products(id,price,stock,has_skus,delivery_type) values
  (:'workspace_product', 999, 55, false, 'automatic'),
  (:'failure_product', 88, 4, false, 'automatic');

-- Case 1/2: one ten-row create transaction succeeds, preserves safe metadata defaults,
-- and recomputes the parent from active rows only.
select public.admin_save_product_sku_workspace(
  :'workspace_product',
  (select jsonb_agg(jsonb_build_object(
    'type','create','client_id','client-' || i,
    'payload',jsonb_build_object(
      'sku_title',i || ' USD','sku_code',i || '-usd','price',i,
      'original_price',null,'stock',0,'status','draft','delivery_type','automatic',
      'image_url',null,'sort_order',i
    )
  ) order by i) from generate_series(1,10) i)
) as create_result \gset
select pg_temp.assert_workspace((:'create_result'::jsonb->>'created_count')::int=10, 'TEN_CREATE_COUNT');
select pg_temp.assert_workspace((select count(*)=10 from public.product_skus where product_id=:'workspace_product'), 'TEN_CREATE_ROWS');
select pg_temp.assert_workspace((select bool_and(metadata='{}'::jsonb) from public.product_skus where product_id=:'workspace_product'), 'CREATE_SAFE_METADATA');
select pg_temp.assert_workspace((select has_skus and stock=0 and price=999 from public.products where id=:'workspace_product'), 'CREATE_PARENT_SUMMARY');

-- Case 3: nine valid + one invalid creates abort before all writes and summary changes.
\set ON_ERROR_STOP off
select public.admin_save_product_sku_workspace(
  :'failure_product',
  (select jsonb_agg(jsonb_build_object(
    'type','create','client_id','invalid-' || i,
    'payload',jsonb_build_object(
      'sku_title',i || ' USD','sku_code','invalid-' || i,'price',i,
      'original_price',null,'stock',case when i=10 then -1 else 0 end,
      'status','draft','delivery_type','automatic','image_url',null,'sort_order',i
    )
  ) order by i) from generate_series(1,10) i)
);
\if :ERROR
\else
  \echo 'WORKSPACE_9_PLUS_1_EXPECTED_FAILURE_MISSING'
  \quit 1
\endif
\set ON_ERROR_STOP on
select pg_temp.assert_workspace((select count(*)=0 from public.product_skus where product_id=:'failure_product'), 'NINE_PLUS_ONE_ZERO_SKU_WRITES');
select pg_temp.assert_workspace((select not has_skus and stock=4 and price=88 from public.products where id=:'failure_product'), 'NINE_PLUS_ONE_PARENT_UNCHANGED');

-- Case 4: five valid updates plus one stale version abort every update.
create temporary table workspace_before as
select id, sku_title, updated_at from public.product_skus where product_id=:'workspace_product';
\set ON_ERROR_STOP off
select public.admin_save_product_sku_workspace(
  :'workspace_product',
  (select jsonb_agg(jsonb_build_object(
    'type','update','sku_id',id,
    'expected_updated_at',case when sort_order=6 then '2000-01-01T00:00:00Z' else updated_at::text end,
    'payload',jsonb_build_object(
      'sku_title','changed-' || sort_order,'sku_code',sku_code,'price',price,
      'original_price',original_price,'stock',stock,'status',status,
      'delivery_type',delivery_type,'image_url',image_url,'sort_order',sort_order
    )
  ) order by sort_order) from public.product_skus where product_id=:'workspace_product' and sort_order<=6)
);
\if :ERROR
\else
  \echo 'WORKSPACE_STALE_EXPECTED_FAILURE_MISSING'
  \quit 1
\endif
\set ON_ERROR_STOP on
select pg_temp.assert_workspace(not exists(
  select 1 from public.product_skus s join workspace_before b using(id)
  where s.sku_title is distinct from b.sku_title or s.updated_at is distinct from b.updated_at
), 'STALE_ZERO_WRITES');

-- Case 5: duplicate normalized code aborts the complete create batch.
\set ON_ERROR_STOP off
select public.admin_save_product_sku_workspace(:'failure_product', jsonb_build_array(
  jsonb_build_object('type','create','client_id','duplicate-a','payload',jsonb_build_object('sku_title','A','sku_code',' DUP ','price',1,'original_price',null,'stock',0,'status','draft','delivery_type','automatic','image_url',null,'sort_order',1)),
  jsonb_build_object('type','create','client_id','duplicate-b','payload',jsonb_build_object('sku_title','B','sku_code','dup','price',2,'original_price',null,'stock',0,'status','draft','delivery_type','automatic','image_url',null,'sort_order',2))
));
\if :ERROR
\else
  \echo 'WORKSPACE_DUPLICATE_EXPECTED_FAILURE_MISSING'
  \quit 1
\endif
\set ON_ERROR_STOP on
select pg_temp.assert_workspace((select count(*)=0 from public.product_skus where product_id=:'failure_product'), 'DUPLICATE_ZERO_WRITES');

-- Case 6: an exact SKU from another product aborts valid sibling updates too.
\set wrong_product_sku '30000000-0000-4000-8000-000000000001'
\set local_sku '00000000-0000-0000-0000-000000000000'
select id as local_sku from public.product_skus where product_id=:'workspace_product' order by sort_order limit 1 \gset
\set ON_ERROR_STOP off
select public.admin_save_product_sku_workspace(:'workspace_product', jsonb_build_array(
  (select jsonb_build_object('type','update','sku_id',id,'expected_updated_at',updated_at::text,'payload',jsonb_build_object('sku_title','must-not-change','sku_code',sku_code,'price',price,'original_price',original_price,'stock',stock,'status',status,'delivery_type',delivery_type,'image_url',image_url,'sort_order',sort_order)) from public.product_skus where id=:'local_sku'),
  (select jsonb_build_object('type','update','sku_id',id,'expected_updated_at',updated_at::text,'payload',jsonb_build_object('sku_title',sku_title,'sku_code',sku_code,'price',price,'original_price',original_price,'stock',stock,'status',status,'delivery_type',delivery_type,'image_url',image_url,'sort_order',sort_order)) from public.product_skus where id=:'wrong_product_sku')
));
\if :ERROR
\else
  \echo 'WORKSPACE_OWNERSHIP_EXPECTED_FAILURE_MISSING'
  \quit 1
\endif
\set ON_ERROR_STOP on
select pg_temp.assert_workspace((select sku_title <> 'must-not-change' from public.product_skus where id=:'local_sku'), 'WRONG_PRODUCT_ZERO_WRITES');

-- Case 7: exact local inventory allows activation and updates parent summary atomically.
insert into public.digital_inventory(id,product_id,sku_id,status)
values('60000000-0000-4000-8000-000000000001',:'workspace_product',:'local_sku','available');
select public.admin_save_product_sku_workspace(:'workspace_product', jsonb_build_array(
  (select jsonb_build_object('type','update','sku_id',id,'expected_updated_at',updated_at::text,'payload',jsonb_build_object('sku_title',sku_title,'sku_code',sku_code,'price',price,'original_price',original_price,'stock',1,'status','active','delivery_type','automatic','image_url',image_url,'sort_order',sort_order)) from public.product_skus where id=:'local_sku')
)) as activation_result \gset
select pg_temp.assert_workspace((:'activation_result'::jsonb->>'updated_count')::int=1, 'ACTIVATION_READY_SUCCESS');
select pg_temp.assert_workspace((select status='active' and stock=1 from public.product_skus where id=:'local_sku'), 'ACTIVATION_READY_ROW');
select pg_temp.assert_workspace((select stock=1 and price=1 from public.products where id=:'workspace_product'), 'ACTIVATION_READY_SUMMARY');

-- Case 8: a blocked activation and a valid title edit in the same workspace make zero writes.
\set blocked_sku '00000000-0000-0000-0000-000000000000'
select id as blocked_sku from public.product_skus where product_id=:'workspace_product' and id<>:'local_sku' order by sort_order limit 1 \gset
\set ON_ERROR_STOP off
select public.admin_save_product_sku_workspace(:'workspace_product', jsonb_build_array(
  (select jsonb_build_object('type','update','sku_id',id,'expected_updated_at',updated_at::text,'payload',jsonb_build_object('sku_title','must-also-not-change','sku_code',sku_code,'price',price,'original_price',original_price,'stock',stock,'status',status,'delivery_type',delivery_type,'image_url',image_url,'sort_order',sort_order)) from public.product_skus where id=:'local_sku'),
  (select jsonb_build_object('type','update','sku_id',id,'expected_updated_at',updated_at::text,'payload',jsonb_build_object('sku_title',sku_title,'sku_code',sku_code,'price',price,'original_price',original_price,'stock',1,'status','active','delivery_type','automatic','image_url',image_url,'sort_order',sort_order)) from public.product_skus where id=:'blocked_sku')
));
\if :ERROR
\else
  \echo 'WORKSPACE_ACTIVATION_BLOCK_EXPECTED_FAILURE_MISSING'
  \quit 1
\endif
\set ON_ERROR_STOP on
select pg_temp.assert_workspace((select sku_title <> 'must-also-not-change' from public.product_skus where id=:'local_sku'), 'ACTIVATION_BLOCKED_ZERO_WRITES');
select pg_temp.assert_workspace((select status='draft' from public.product_skus where id=:'blocked_sku'), 'ACTIVATION_BLOCKED_TARGET_UNCHANGED');

-- Case 9: already-active automatic edits are rechecked; removing exact evidence makes the edit fail closed.
update public.digital_inventory set status='reserved' where sku_id=:'local_sku';
\set ON_ERROR_STOP off
select public.admin_save_product_sku_workspace(:'workspace_product', jsonb_build_array(
  (select jsonb_build_object('type','update','sku_id',id,'expected_updated_at',updated_at::text,'payload',jsonb_build_object('sku_title','unsafe-active-edit','sku_code',sku_code,'price',price,'original_price',original_price,'stock',1,'status','active','delivery_type','automatic','image_url',image_url,'sort_order',sort_order)) from public.product_skus where id=:'local_sku')
));
\if :ERROR
\else
  \echo 'WORKSPACE_ACTIVE_UNSAFE_EXPECTED_FAILURE_MISSING'
  \quit 1
\endif
\set ON_ERROR_STOP on
select pg_temp.assert_workspace((select sku_title <> 'unsafe-active-edit' and status='active' from public.product_skus where id=:'local_sku'), 'ACTIVE_UNSAFE_ZERO_WRITES');

-- Apple regression: ten draft/zero/requires-verification rows cannot be activated as a workspace.
update public.product_skus set status='draft', stock=0, metadata='{"inventory_state":"requires_verification"}'::jsonb where product_id=:'workspace_product';
\set ON_ERROR_STOP off
select public.admin_save_product_sku_workspace(
  :'workspace_product',
  (select jsonb_agg(jsonb_build_object(
    'type','update','sku_id',id,'expected_updated_at',updated_at::text,
    'payload',jsonb_build_object('sku_title',sku_title,'sku_code',sku_code,'price',price,'original_price',original_price,'stock',0,'status','active','delivery_type','automatic','image_url',image_url,'sort_order',sort_order)
  ) order by sort_order) from public.product_skus where product_id=:'workspace_product')
);
\if :ERROR
\else
  \echo 'WORKSPACE_APPLE_EXPECTED_FAILURE_MISSING'
  \quit 1
\endif
\set ON_ERROR_STOP on
select pg_temp.assert_workspace((select count(*)=10 from public.product_skus where product_id=:'workspace_product' and status='draft' and stock=0 and metadata->>'inventory_state'='requires_verification'), 'APPLE_TEN_ZERO_WRITES');

select 'ADMIN_CATALOG_SKU_WORKSPACE_ATOMICITY_CASES_PASS';
