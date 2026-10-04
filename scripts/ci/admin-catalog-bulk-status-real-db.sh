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
"${psql_safe[@]}" -q -f supabase/migrations/20261004120000_admin_catalog_transactional_bulk_status_p2_2.sql
"${psql_safe[@]}" -q -f scripts/ci/admin-catalog-bulk-status-real-db.sql | grep -q ADMIN_CATALOG_BULK_STATUS_ATOMICITY_CASES_PASS
"${psql_safe[@]}" -q -f supabase/migrations/20261004180000_admin_catalog_transactional_bulk_activation_p2_3.sql
"${psql_safe[@]}" -q -f scripts/ci/admin-catalog-bulk-activation-real-db.sql | grep -q ADMIN_CATALOG_BULK_ACTIVATION_ATOMICITY_CASES_PASS

race_dir="$(mktemp -d)"
cleanup() { rm -f "$race_dir"/*.out; rmdir "$race_dir" 2>/dev/null || true; }
trap cleanup EXIT

activation_call="select public.admin_bulk_activate_product_skus('10000000-0000-4000-8000-000000000001', array['20000000-0000-4000-8000-000000000001'::uuid]);"

run_blocked_race() {
  local name="$1"
  local setup_sql="$2"
  local concurrent_sql="$3"
  "${psql_safe[@]}" -q -c "$setup_sql"
  "${psql_safe[@]}" -q -c "begin; $concurrent_sql; select pg_sleep(3); commit;" >"$race_dir/$name-a.out" 2>&1 &
  local pid_a=$!
  sleep 0.5
  local started_at
  started_at="$(date +%s)"
  "${psql_safe[@]}" -Atqc "$activation_call" >"$race_dir/$name-b.out" 2>&1
  local elapsed=$(( $(date +%s) - started_at ))
  wait "$pid_a"
  test "$elapsed" -ge 2
  grep -q 'BULK_ACTIVATION_NOT_READY' "$race_dir/$name-b.out"
  "${psql_safe[@]}" -Atqc "select status from public.product_skus where id='20000000-0000-4000-8000-000000000001'" | grep -qx draft
  echo "ACTIVATION_${name}_CONCURRENCY_PASS"
}

run_blocked_race "STOCK" \
  "update public.product_skus set status='draft', stock=1, metadata='{}'::jsonb where id='20000000-0000-4000-8000-000000000001'; delete from public.digital_inventory where sku_id='20000000-0000-4000-8000-000000000001'; insert into public.digital_inventory(id,product_id,sku_id,status) values('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','available');" \
  "update public.product_skus set stock=0 where id='20000000-0000-4000-8000-000000000001'"

run_blocked_race "LOCAL_INVENTORY" \
  "update public.product_skus set status='draft', stock=1, metadata='{}'::jsonb where id='20000000-0000-4000-8000-000000000001'; update public.digital_inventory set status='available' where id='50000000-0000-4000-8000-000000000001';" \
  "update public.digital_inventory set status='reserved' where id='50000000-0000-4000-8000-000000000001'"

supplier_metadata='{"fulfillment_source":"supplier","supplier":"daju","supplier_product_id":15,"supplier_sku":"13","supplier_inputs_mapping":{},"supplier_max_unit_cost":"8.50","supplier_stock_snapshot":7,"supplier_stock_sync_status":"synced","supplier_stock_last_success_at":"2026-10-01T00:00:00Z","supplier_stock_stale":false}'
run_blocked_race "SUPPLIER_SNAPSHOT" \
  "update public.product_skus set status='draft', stock=7, metadata='$supplier_metadata'::jsonb where id='20000000-0000-4000-8000-000000000001';" \
  "update public.product_skus set metadata=jsonb_set(metadata,'{supplier_stock_stale}','true'::jsonb) where id='20000000-0000-4000-8000-000000000001'"

run_blocked_race "SUPPLIER_BINDING" \
  "update public.product_skus set status='draft', stock=7, metadata='$supplier_metadata'::jsonb where id='20000000-0000-4000-8000-000000000001';" \
  "update public.product_skus set metadata='{}'::jsonb where id='20000000-0000-4000-8000-000000000001'"

# Activation exact-set race: a concurrent delete must abort the whole batch.
"${psql_safe[@]}" -q -c "update public.product_skus set status='draft' where product_id='10000000-0000-4000-8000-000000000001'"
"${psql_safe[@]}" -q -c "begin; delete from public.product_skus where id='20000000-0000-4000-8000-000000000010'; select pg_sleep(3); commit;" >"$race_dir/activation-delete-a.out" 2>&1 &
activation_delete_pid=$!
sleep 0.5
activation_delete_started="$(date +%s)"
set +e
"${psql_safe[@]}" -q -c "select public.admin_bulk_activate_product_skus('10000000-0000-4000-8000-000000000001', array(select ('20000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid from generate_series(1,10) i));" >"$race_dir/activation-delete-b.out" 2>&1
activation_delete_rc=$?
set -e
activation_delete_elapsed=$(( $(date +%s) - activation_delete_started ))
wait "$activation_delete_pid"
test "$activation_delete_rc" -ne 0
test "$activation_delete_elapsed" -ge 2
grep -q BULK_SKU_OWNERSHIP_MISMATCH "$race_dir/activation-delete-b.out"
"${psql_safe[@]}" -Atqc "select count(*) from public.product_skus where product_id='10000000-0000-4000-8000-000000000001' and status='active'" | grep -qx 0
echo ACTIVATION_SELECTED_DELETE_CONCURRENCY_PASS

# Restore the isolated fixture for the existing P2.2 delete race.
"${psql_safe[@]}" -q -c "insert into public.product_skus(id,product_id,sku_code,sku_title,combination_key,price,stock,status,sort_order,metadata) values('20000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','10-usd','10 USD','10-usd',10,10,'active',10,'{}'::jsonb)"

# True race: A deletes one selected row while holding the transaction; B must wait,
# then reject the exact set and roll back all of its potential status changes.
"${psql_safe[@]}" -q -c "update public.product_skus set status='active' where product_id='10000000-0000-4000-8000-000000000001'"
"${psql_safe[@]}" -q -c "begin; delete from public.product_skus where id='20000000-0000-4000-8000-000000000010'; select pg_sleep(3); commit;" >"$race_dir/a.out" 2>&1 &
pid_a=$!
sleep 0.5
race_started_at="$(date +%s)"
set +e
"${psql_safe[@]}" -q -c "select public.admin_bulk_update_product_sku_status('10000000-0000-4000-8000-000000000001', array(select ('20000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid from generate_series(1,10) i), 'draft');" >"$race_dir/b.out" 2>&1
race_rc=$?
set -e
race_elapsed=$(( $(date +%s) - race_started_at ))
wait "$pid_a"
test "$race_rc" -ne 0
test "$race_elapsed" -ge 2
grep -q BULK_SKU_OWNERSHIP_MISMATCH "$race_dir/b.out"
"${psql_safe[@]}" -Atqc "select count(*) from public.product_skus where product_id='10000000-0000-4000-8000-000000000001' and status='active'" | grep -qx 9
echo REAL_DB_CONCURRENCY_TEST_PASS
