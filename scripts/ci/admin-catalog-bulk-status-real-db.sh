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

# True race: A deletes one selected row while holding the transaction; B must wait,
# then reject the exact set and roll back all of its potential status changes.
"${psql_safe[@]}" -q -c "update public.product_skus set status='active' where product_id='10000000-0000-4000-8000-000000000001'"
race_dir="$(mktemp -d)"
cleanup() { rm -f "$race_dir/a.out" "$race_dir/b.out"; rmdir "$race_dir" 2>/dev/null || true; }
trap cleanup EXIT

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
