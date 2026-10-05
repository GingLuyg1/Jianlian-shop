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
"${psql_safe[@]}" -q -f supabase/migrations/20261006120000_admin_catalog_transactional_local_inventory_p2_5b.sql
"${psql_safe[@]}" -q -f scripts/ci/admin-catalog-local-inventory-real-db.sql | grep -q ADMIN_LOCAL_INVENTORY_ATOMICITY_CASES_PASS
bash scripts/ci/admin-catalog-local-inventory-concurrency.sh | grep -q ADMIN_LOCAL_INVENTORY_CONCURRENCY_CASES_PASS
echo ADMIN_LOCAL_INVENTORY_REAL_DB_PASS
