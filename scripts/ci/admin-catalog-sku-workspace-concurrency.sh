#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST is required}"
: "${PGPORT:?PGPORT is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGDATABASE:?PGDATABASE is required}"
test "$PGHOST" = "127.0.0.1"
test "$PGPORT" = "54322"
test "$PGDATABASE" = "postgres"
test -z "${SUPABASE_ACCESS_TOKEN:-}"
test ! -e supabase/.temp/project-ref

psql_safe=(psql -X -v ON_ERROR_STOP=1)
"${psql_safe[@]}" -Atqc "select marker from public.ci_admin_catalog_guard" | grep -qx JOB_LOCAL_ADMIN_CATALOG_DB

race_dir="$(mktemp -d)"
cleanup() { rm -f "$race_dir"/*.out; rmdir "$race_dir" 2>/dev/null || true; }
trap cleanup EXIT

product_id="10000000-0000-4000-8000-000000000005"
sku_a="70000000-0000-4000-8000-000000000001"
sku_b="70000000-0000-4000-8000-000000000002"
inventory_id="80000000-0000-4000-8000-000000000001"

"${psql_safe[@]}" -q -c "
insert into public.products(id,price,stock,has_skus,delivery_type)
values('$product_id',10,0,true,'automatic');
insert into public.product_skus(id,product_id,sku_code,sku_title,combination_key,price,stock,status,sort_order,metadata)
values
('$sku_a','$product_id','race-a','Race A','race-a',10,1,'draft',1,'{}'::jsonb),
('$sku_b','$product_id','race-b','Race B','race-b',20,1,'draft',2,'{}'::jsonb);
insert into public.digital_inventory(id,product_id,sku_id,status)
values('$inventory_id','$product_id','$sku_a','available');"

workspace_update_sql() {
  local sku_id="$1"
  local title="$2"
  local status="$3"
  cat <<SQL
select public.admin_save_product_sku_workspace('$product_id', jsonb_build_array(
  (select jsonb_build_object(
    'type','update','sku_id',id,'expected_updated_at',updated_at::text,
    'payload',jsonb_build_object(
      'sku_title','$title','sku_code',sku_code,'price',price,'original_price',original_price,
      'stock',stock,'status','$status','delivery_type',delivery_type,'image_url',image_url,'sort_order',sort_order
    )
  ) from public.product_skus where id='$sku_id')
));
SQL
}

# Local inventory race: the workspace must wait, re-read the reserved inventory and fail.
"${psql_safe[@]}" -q -c "begin; update public.digital_inventory set status='reserved' where id='$inventory_id'; select pg_sleep(3); commit;" >"$race_dir/local-a.out" 2>&1 &
pid_a=$!
sleep 0.5
started="$(date +%s)"
set +e
"${psql_safe[@]}" -q -c "$(workspace_update_sql "$sku_a" "Local Race" "active")" >"$race_dir/local-b.out" 2>&1
local_rc=$?
set -e
elapsed=$(( $(date +%s) - started ))
wait "$pid_a"
test "$local_rc" -ne 0
test "$elapsed" -ge 2
grep -q SKU_ACTIVATION_NOT_READY "$race_dir/local-b.out"
"${psql_safe[@]}" -Atqc "select status || ':' || sku_title from public.product_skus where id='$sku_a'" | grep -qx 'draft:Race A'
echo WORKSPACE_LOCAL_INVENTORY_RACE_PASS

# Supplier metadata race: row locks serialize and optimistic concurrency rejects the stale editor.
supplier_metadata='{"fulfillment_source":"supplier","supplier":"daju","supplier_product_id":15,"supplier_sku":"13","supplier_inputs_mapping":{},"supplier_max_unit_cost":"8.50","supplier_stock_snapshot":7,"supplier_stock_sync_status":"synced","supplier_stock_last_success_at":"2026-10-01T00:00:00Z","supplier_stock_stale":false}'
"${psql_safe[@]}" -q -c "update public.product_skus set stock=7,status='draft',metadata='$supplier_metadata'::jsonb where id='$sku_a'"
"${psql_safe[@]}" -q -c "begin; update public.product_skus set metadata='{}'::jsonb where id='$sku_a'; select pg_sleep(3); commit;" >"$race_dir/supplier-a.out" 2>&1 &
pid_a=$!
sleep 0.5
started="$(date +%s)"
set +e
"${psql_safe[@]}" -q -c "$(workspace_update_sql "$sku_a" "Supplier Race" "active")" >"$race_dir/supplier-b.out" 2>&1
supplier_rc=$?
set -e
elapsed=$(( $(date +%s) - started ))
wait "$pid_a"
test "$supplier_rc" -ne 0
test "$elapsed" -ge 2
grep -q SKU_WORKSPACE_STALE "$race_dir/supplier-b.out"
"${psql_safe[@]}" -Atqc "select status || ':' || sku_title from public.product_skus where id='$sku_a'" | grep -qx 'draft:Race A'
echo WORKSPACE_SUPPLIER_METADATA_RACE_PASS

# Delete race: a deleted selected row must reject the exact workspace, never partially save.
"${psql_safe[@]}" -q -c "begin; delete from public.product_skus where id='$sku_b'; select pg_sleep(3); commit;" >"$race_dir/delete-a.out" 2>&1 &
pid_a=$!
sleep 0.5
started="$(date +%s)"
set +e
"${psql_safe[@]}" -q -c "$(workspace_update_sql "$sku_b" "Delete Race" "draft")" >"$race_dir/delete-b.out" 2>&1
delete_rc=$?
set -e
elapsed=$(( $(date +%s) - started ))
wait "$pid_a"
test "$delete_rc" -ne 0
test "$elapsed" -ge 2
grep -q SKU_OWNERSHIP_MISMATCH "$race_dir/delete-b.out"
"${psql_safe[@]}" -Atqc "select count(*) from public.product_skus where id='$sku_b'" | grep -qx 0
echo WORKSPACE_DELETE_RACE_PASS

"${psql_safe[@]}" -q -c "insert into public.product_skus(id,product_id,sku_code,sku_title,combination_key,price,stock,status,sort_order,metadata) values('$sku_b','$product_id','race-b','Race B','race-b',20,1,'draft',2,'{}'::jsonb)"

# Different touched SKUs serialize on the product/full set but both remain valid.
"${psql_safe[@]}" -q -c "begin; $(workspace_update_sql "$sku_a" "Different A" "draft") select pg_sleep(3); commit;" >"$race_dir/different-a.out" 2>&1 &
pid_a=$!
sleep 0.5
started="$(date +%s)"
"${psql_safe[@]}" -q -c "$(workspace_update_sql "$sku_b" "Different B" "draft")" >"$race_dir/different-b.out" 2>&1
elapsed=$(( $(date +%s) - started ))
wait "$pid_a"
test "$elapsed" -ge 2
"${psql_safe[@]}" -Atqc "select string_agg(sku_title,',' order by id) from public.product_skus where id in ('$sku_a','$sku_b')" | grep -qx 'Different A,Different B'
echo WORKSPACE_DIFFERENT_SKU_SERIAL_SUCCESS_PASS

# Same touched SKU: the second request captured an old version and must fail stale.
same_expected="$("${psql_safe[@]}" -Atqc "select updated_at::text from public.product_skus where id='$sku_a'")"
same_payload="jsonb_build_array(jsonb_build_object('type','update','sku_id','$sku_a','expected_updated_at','$same_expected','payload',jsonb_build_object('sku_title','Same B','sku_code','race-a','price',10,'original_price',null,'stock',7,'status','draft','delivery_type','automatic','image_url',null,'sort_order',1)))"
"${psql_safe[@]}" -q -c "begin; select public.admin_save_product_sku_workspace('$product_id', jsonb_build_array(jsonb_build_object('type','update','sku_id','$sku_a','expected_updated_at','$same_expected','payload',jsonb_build_object('sku_title','Same A','sku_code','race-a','price',10,'original_price',null,'stock',7,'status','draft','delivery_type','automatic','image_url',null,'sort_order',1)))); select pg_sleep(3); commit;" >"$race_dir/same-a.out" 2>&1 &
pid_a=$!
sleep 0.5
started="$(date +%s)"
set +e
"${psql_safe[@]}" -q -c "select public.admin_save_product_sku_workspace('$product_id',$same_payload);" >"$race_dir/same-b.out" 2>&1
same_rc=$?
set -e
elapsed=$(( $(date +%s) - started ))
wait "$pid_a"
test "$same_rc" -ne 0
test "$elapsed" -ge 2
grep -q SKU_WORKSPACE_STALE "$race_dir/same-b.out"
"${psql_safe[@]}" -Atqc "select sku_title from public.product_skus where id='$sku_a'" | grep -qx 'Same A'
echo WORKSPACE_SAME_SKU_STALE_PASS

echo ADMIN_CATALOG_SKU_WORKSPACE_CONCURRENCY_PASS
