import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20261006120000_admin_catalog_transactional_local_inventory_p2_5b.sql";
const migration = readFileSync(migrationPath, "utf8");
const normalized = migration.replace(/\s+/g, " ").toLowerCase();
const minimalSchema = readFileSync(
  "scripts/ci/admin-catalog-local-inventory-minimal-schema.sql",
  "utf8",
);
const realDb = readFileSync(
  "scripts/ci/admin-catalog-local-inventory-real-db.sql",
  "utf8",
);
const runner = readFileSync(
  "scripts/ci/admin-catalog-local-inventory-real-db.sh",
  "utf8",
);
const concurrency = readFileSync(
  "scripts/ci/admin-catalog-local-inventory-concurrency.sh",
  "utf8",
);
const workflow = readFileSync(
  ".github/workflows/admin-catalog-bulk-status.yml",
  "utf8",
);

test("local inventory migration is forward-only and avoids business-data rewrites", () => {
  assert.match(migration, /^-- Forward-only:/);
  assert.match(normalized, /begin; set local lock_timeout = '5s'; set local statement_timeout = '30s';/);
  assert.match(normalized, /commit;\s*$/);
  assert.doesNotMatch(normalized, /drop\s+(table|column|schema)\b/);
  assert.doesNotMatch(normalized, /\btruncate\b/);
  assert.doesNotMatch(normalized, /delete\s+from\s+public\.(digital_inventory|products|product_skus)\b/);
  assert.doesNotMatch(normalized, /update\s+public\.digital_inventory\s+set\s+reserved_/);
  assert.doesNotMatch(normalized, /create\s+or\s+replace\s+function\s+public\.[^(]*delete/i);
});

test("migration rechecks the authoritative per-product md5 uniqueness contract", () => {
  assert.match(migration, /digital_inventory_product_content_uidx/);
  assert.match(normalized, /indexes\.indisunique/);
  assert.match(normalized, /\(product_id,md5\(content\)\)/);
  assert.match(normalized, /inventory\.product_id = p_product_id[\s\S]*md5\(inventory\.content\)/);
  assert.doesNotMatch(normalized, /unique\s*\([^)]*content_hash/);
});

test("historical stale fulfillment evidence fails closed without repair", () => {
  assert.match(migration, /HISTORICAL_STALE_RESERVATION_LINKS_REQUIRE_REMEDIATION/);
  for (const column of [
    "order_id",
    "reserved_order_id",
    "reserved_order_item_id",
    "reserved_user_id",
    "reserved_at",
    "delivered_order_id",
    "delivered_order_item_id",
    "delivered_user_id",
    "delivered_at",
  ]) {
    assert.match(migration, new RegExp(`inventory\\.${column} is not null`));
  }
  assert.match(normalized, /from public\.order_deliveries as delivery where delivery\.inventory_id = inventory\.id/);
});

test("new mutation RPCs use strict admin security and minimal ACL", () => {
  for (const signature of [
    "admin_import_local_inventory(uuid,uuid,jsonb,text,text,text,uuid)",
    "admin_transition_local_inventory(uuid,uuid,jsonb,text,text,uuid)",
    "admin_list_digital_inventory_items_v2(uuid,uuid,text,integer,integer)",
  ]) {
    const escaped = signature.replace(/[()]/g, "\\$&");
    assert.match(normalized, new RegExp(`revoke all on function public\\.${escaped} from public`));
    assert.match(normalized, new RegExp(`revoke all on function public\\.${escaped} from anon`));
    assert.match(normalized, new RegExp(`grant execute on function public\\.${escaped} to authenticated`));
  }
  assert.equal((normalized.match(/security definer/g) ?? []).length, 3);
  assert.equal((normalized.match(/set search_path = pg_catalog/g) ?? []).length, 3);
  assert.match(normalized, /auth\.uid\(\)[\s\S]*public\.is_admin/);
  assert.doesNotMatch(normalized, /p_actor|p_admin|p_user_id/);
  assert.match(normalized, /revoke all privileges on table public\.admin_local_inventory_operations from public, anon, authenticated/);
});

test("import is bounded, ownership-aware, normalized, idempotent, and atomic", () => {
  assert.match(migration, /create or replace function public\.admin_import_local_inventory/);
  assert.match(normalized, /jsonb_array_length\(p_items\) > 1000/);
  assert.match(normalized, /if v_product_has_skus then[\s\S]*p_sku_id is null[\s\S]*sku\.product_id = p_product_id/);
  assert.match(normalized, /normalize_order_item_delivery_type\(v_effective_delivery_type\) <> 'auto_delivery'/);
  assert.match(normalized, /btrim\(item\.value #>> '\{\}'/);
  assert.match(migration, /DUPLICATE_IN_REQUEST/);
  assert.match(migration, /DUPLICATE_EXISTING/);
  assert.match(migration, /IDEMPOTENCY_CONFLICT/);
  assert.match(normalized, /insert into public\.digital_inventory[\s\S]*get diagnostics v_created_count = row_count[\s\S]*import_exact_count_mismatch/);
  assert.match(normalized, /insert into public\.admin_audit_logs[\s\S]*update public\.admin_local_inventory_operations/);
});

test("transition locks exact rows in deterministic order and enforces safe matrix", () => {
  assert.match(migration, /create or replace function public\.admin_transition_local_inventory/);
  assert.match(normalized, /jsonb_array_length\(p_items\) > 100/);
  assert.match(normalized, /order by inventory\.id for update/);
  assert.match(normalized, /v_found_count <> v_selected_count[\s\S]*inventory_not_found/);
  assert.match(normalized, /v_owned_count <> v_selected_count[\s\S]*inventory_ownership_mismatch/);
  assert.match(normalized, /inventory\.status is distinct from expected\.expected_status[\s\S]*inventory\.updated_at is distinct from expected\.expected_updated_at/);
  assert.match(normalized, /p_target_status = 'disabled'[\s\S]*inventory\.status <> 'available'/);
  assert.match(normalized, /inventory\.status <> 'disabled'/);
  assert.match(normalized, /inventory\.expires_at <= now\(\)/);
  assert.match(migration, /INVENTORY_HAS_RESERVATION/);
  assert.match(migration, /INVENTORY_ALREADY_DELIVERED/);
  assert.doesNotMatch(normalized, /set status = '(reserved|delivered|expired|invalid)'/);
});

test("audit and list contracts never expose raw delivery content", () => {
  assert.doesNotMatch(normalized, /jsonb_build_object\([^;]*'content'\s*,\s*(content|inventory\.content)/);
  assert.match(normalized, /public\.mask_delivery_secret\(inventory\.content\) as masked_content/);
  assert.doesNotMatch(normalized, /returns table \([^;]*\bcontent text\b/);
  assert.match(normalized, /count\(\*\) over\(\) as total_rows/);
  assert.match(normalized, /p_sku_id is null or inventory\.sku_id = p_sku_id/);
  assert.match(normalized, /v_status = 'all' or inventory\.status = v_status/);
});

test("real PostgreSQL suite proves rollback, idempotency, masking, and races", () => {
  for (const marker of [
    "invalid batch inventory rollback",
    "request duplicate rollback",
    "existing duplicate rollback",
    "wrong product or SKU rollback",
    "audit failure import rollback",
    "import idempotent retry",
    "transition idempotent retry",
    "transition exact set rollback",
    "stale row remains disabled",
    "reserved unchanged",
    "delivered unchanged",
    "stale reservation preserved fail closed",
    "delivery evidence preserved fail closed",
    "transition audit rollback",
    "audit contains no inventory secret",
    "list response is masked",
    "P2.5A diagnostics observes imported available inventory",
    "P2.5A diagnostics decreases after disable",
    "P2.5A diagnostics restores available count",
  ]) {
    assert.match(realDb, new RegExp(marker));
  }
  for (const marker of [
    "CONCURRENT_ADMIN_ADMIN_SAFE",
    "CONCURRENT_FULFILLMENT_FIRST_SAFE",
    "CONCURRENT_ADMIN_FIRST_SAFE",
    "IMPORT_ALLOCATION_ISOLATION_PASS",
  ]) {
    assert.match(concurrency, new RegExp(marker));
  }
});

test("CI database runner fails closed to the job-local Supabase database", () => {
  for (const script of [runner, concurrency]) {
    assert.match(script, /set -euo pipefail/);
    assert.match(script, /test "\$PGHOST" = "127\.0\.0\.1"/);
    assert.match(script, /test "\$PGPORT" = "54322"/);
    assert.match(script, /test "\$PGDATABASE" = "postgres"/);
    assert.match(script, /test -z "\$\{SUPABASE_ACCESS_TOKEN:-\}"/);
    assert.match(script, /test ! -e supabase\/\.temp\/project-ref/);
    assert.match(script, /JOB_LOCAL_ADMIN_INVENTORY_DB/);
  }
  assert.match(minimalSchema, /JOB_LOCAL_ADMIN_INVENTORY_DB/);
  assert.match(workflow, /local-inventory-postgresql:/);
  assert.match(workflow, /admin-catalog-local-inventory-minimal-schema\.sql/);
  assert.match(workflow, /admin-catalog-local-inventory-real-db\.sh/);
});
