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

run_psql_file() {
  local phase="$1"
  local file="$2"
  local expected_marker="${3:-}"
  local output_file
  local detail
  output_file="$(mktemp)"
  if ! "${psql_safe[@]}" -q -f "$file" >"$output_file" 2>&1; then
    detail="$(grep -m1 -E '(^|: )ERROR:' "$output_file" || true)"
    if test -z "$detail"; then
      detail="PostgreSQL command failed without a structured ERROR line"
    fi
    detail="${detail//'%'/'%25'}"
    detail="${detail//$'\r'/'%0D'}"
    detail="${detail//$'\n'/'%0A'}"
    echo "::error title=Local inventory ${phase} failed::${detail}"
    rm -f "$output_file"
    return 1
  fi
  if test -n "$expected_marker" && ! grep -q "$expected_marker" "$output_file"; then
    echo "::error title=Local inventory ${phase} failed::Expected success marker was not emitted"
    rm -f "$output_file"
    return 1
  fi
  cat "$output_file"
  rm -f "$output_file"
}

"${psql_safe[@]}" -Atqc "select marker from public.ci_admin_local_inventory_guard" | grep -qx JOB_LOCAL_ADMIN_INVENTORY_DB
run_psql_file migration supabase/migrations/20261006120000_admin_catalog_transactional_local_inventory_p2_5b.sql
run_psql_file atomicity scripts/ci/admin-catalog-local-inventory-real-db.sql ADMIN_LOCAL_INVENTORY_ATOMICITY_CASES_PASS
bash scripts/ci/admin-catalog-local-inventory-concurrency.sh | grep -q ADMIN_LOCAL_INVENTORY_CONCURRENCY_CASES_PASS
echo ADMIN_LOCAL_INVENTORY_REAL_DB_PASS
