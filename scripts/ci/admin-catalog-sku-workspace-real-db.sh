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
"${psql_safe[@]}" -q -f supabase/migrations/20261004230000_admin_catalog_transactional_sku_workspace_save_p2_4.sql
"${psql_safe[@]}" -q -f scripts/ci/admin-catalog-sku-workspace-real-db.sql | grep -q ADMIN_CATALOG_SKU_WORKSPACE_ATOMICITY_CASES_PASS
bash scripts/ci/admin-catalog-sku-workspace-concurrency.sh | grep -q ADMIN_CATALOG_SKU_WORKSPACE_CONCURRENCY_PASS
echo ADMIN_CATALOG_SKU_WORKSPACE_REAL_DB_PASS
