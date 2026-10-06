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
"${psql_safe[@]}" -Atqc "select marker from public.ci_admin_local_inventory_guard" | grep -qx JOB_LOCAL_ADMIN_INVENTORY_DB

race_dir="$(mktemp -d)"
cleanup() { rm -f "$race_dir"/*.out; rmdir "$race_dir" 2>/dev/null || true; }
trap cleanup EXIT

admin_prefix="set role authenticated; select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',false); select set_config('request.jwt.claims','{\"sub\":\"90000000-0000-4000-8000-000000000001\",\"email\":\"admin@example.invalid\",\"role\":\"authenticated\"}',false);"

# Admin A wins; Admin B waits for the same row and then fails the stale snapshot.
admin_race_id="51000000-0000-4000-8000-000000000001"
"${psql_safe[@]}" -q -c "insert into public.digital_inventory(id,product_id,sku_id,content,status) values('$admin_race_id','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','ADMIN-RACE','available')"
admin_items="$("${psql_safe[@]}" -Atqc "select public.ci_transition_items(array['$admin_race_id'::uuid])")"
"${psql_safe[@]}" -q -c "begin; $admin_prefix select public.admin_transition_local_inventory('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','$admin_items'::jsonb,'disabled','admin A','71000000-0000-4000-8000-000000000001'); select pg_sleep(3); commit;" >"$race_dir/admin-a.out" 2>&1 &
admin_a_pid=$!
sleep 0.5
admin_started="$(date +%s)"
set +e
"${psql_safe[@]}" -q -c "$admin_prefix select public.admin_transition_local_inventory('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','$admin_items'::jsonb,'disabled','admin B','71000000-0000-4000-8000-000000000002');" >"$race_dir/admin-b.out" 2>&1
admin_b_rc=$?
set -e
admin_elapsed=$(( $(date +%s) - admin_started ))
wait "$admin_a_pid"
test "$admin_b_rc" -ne 0
test "$admin_elapsed" -ge 2
grep -q STALE_STATE "$race_dir/admin-b.out"
"${psql_safe[@]}" -Atqc "select status from public.digital_inventory where id='$admin_race_id'" | grep -qx disabled
"${psql_safe[@]}" -Atqc "select count(*) from public.admin_audit_logs where request_id in ('71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002')" | grep -qx 1
echo CONCURRENT_ADMIN_ADMIN_SAFE

# Fulfillment reserves first. Admin waits, observes stale evidence, and writes nothing.
fulfillment_first_id="51000000-0000-4000-8000-000000000002"
"${psql_safe[@]}" -q -c "insert into public.orders(id) values('61000000-0000-4000-8000-000000000001'); insert into public.digital_inventory(id,product_id,sku_id,content,status) values('$fulfillment_first_id','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','FULFILLMENT-FIRST','available')"
fulfillment_items="$("${psql_safe[@]}" -Atqc "select public.ci_transition_items(array['$fulfillment_first_id'::uuid])")"
"${psql_safe[@]}" -q -c "begin; update public.digital_inventory set status='reserved',reserved_order_id='61000000-0000-4000-8000-000000000001',reserved_at=now() where id='$fulfillment_first_id' and status='available'; select pg_sleep(3); commit;" >"$race_dir/fulfillment-a.out" 2>&1 &
fulfillment_pid=$!
sleep 0.5
set +e
"${psql_safe[@]}" -q -c "$admin_prefix select public.admin_transition_local_inventory('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','$fulfillment_items'::jsonb,'disabled','admin loses','71000000-0000-4000-8000-000000000003');" >"$race_dir/fulfillment-b.out" 2>&1
fulfillment_admin_rc=$?
set -e
wait "$fulfillment_pid"
test "$fulfillment_admin_rc" -ne 0
grep -q STALE_STATE "$race_dir/fulfillment-b.out"
"${psql_safe[@]}" -Atqc "select status from public.digital_inventory where id='$fulfillment_first_id'" | grep -qx reserved
echo CONCURRENT_FULFILLMENT_FIRST_SAFE

# Admin disables first. A normal allocation CAS sees zero available rows.
admin_first_id="51000000-0000-4000-8000-000000000003"
"${psql_safe[@]}" -q -c "insert into public.digital_inventory(id,product_id,sku_id,content,status) values('$admin_first_id','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','ADMIN-FIRST','available')"
admin_first_items="$("${psql_safe[@]}" -Atqc "select public.ci_transition_items(array['$admin_first_id'::uuid])")"
"${psql_safe[@]}" -q -c "begin; $admin_prefix select public.admin_transition_local_inventory('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','$admin_first_items'::jsonb,'disabled','admin wins','71000000-0000-4000-8000-000000000004'); select pg_sleep(3); commit;" >"$race_dir/admin-first-a.out" 2>&1 &
admin_first_pid=$!
sleep 0.5
allocation_count="$("${psql_safe[@]}" -Atqc "with changed as (update public.digital_inventory set status='reserved' where id='$admin_first_id' and status='available' returning id) select count(*) from changed")"
wait "$admin_first_pid"
test "$allocation_count" = "0"
"${psql_safe[@]}" -Atqc "select status from public.digital_inventory where id='$admin_first_id'" | grep -qx disabled
echo CONCURRENT_ADMIN_FIRST_SAFE

# Import rows are invisible before commit and all visible after commit.
"${psql_safe[@]}" -q -c "begin; $admin_prefix select public.admin_import_local_inventory('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','[\"ISOLATION-A\",\"ISOLATION-B\"]'::jsonb,'card_key','isolation','ci.txt','71000000-0000-4000-8000-000000000005'); select pg_sleep(3); commit;" >"$race_dir/import-isolation.out" 2>&1 &
import_pid=$!
sleep 0.5
"${psql_safe[@]}" -Atqc "select count(*) from public.digital_inventory where content in ('ISOLATION-A','ISOLATION-B')" | grep -qx 0
wait "$import_pid"
"${psql_safe[@]}" -Atqc "select count(*) from public.digital_inventory where content in ('ISOLATION-A','ISOLATION-B')" | grep -qx 2
echo IMPORT_ALLOCATION_ISOLATION_PASS

echo ADMIN_LOCAL_INVENTORY_CONCURRENCY_CASES_PASS
