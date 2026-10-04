import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261004230000_admin_catalog_transactional_sku_workspace_save_p2_4.sql", "utf8");
const normalized = migration.replace(/\s+/g, " ").toLowerCase();

test("P2.4 migration is forward-only, transactional and schema/data neutral at install time", () => {
  assert.match(migration, /^-- Forward-only:/);
  assert.match(normalized, /begin;.*create or replace function public\.admin_save_product_sku_workspace.*commit;/);
  assert.doesNotMatch(normalized, /alter table|create table|create index|create trigger/);
  assert.equal((normalized.match(/insert into public\.product_skus/g) ?? []).length, 1);
  assert.match(normalized, /insert into public\.product_skus[\s\S]*from jsonb_array_elements\(v_normalized\)/);
});

test("workspace RPC validates strict bounded operations before writes", () => {
  for (const marker of ["INVALID_SKU_WORKSPACE", "SKU_BATCH_LIMIT_EXCEEDED", "SKU_WORKSPACE_STALE", "SKU_OWNERSHIP_MISMATCH", "SKU_CODE_CONFLICT", "SKU_ACTIVATION_NOT_READY", "PRODUCT_NOT_FOUND"]) {
    assert.match(migration, new RegExp(marker));
  }
  assert.match(normalized, /v_operation_count > 100/);
  assert.match(normalized, /unknown_operation_field/);
  assert.match(normalized, /unknown_payload_field/);
  assert.match(normalized, /duplicate_client_id/);
  assert.match(normalized, /duplicate_sku_id/);
});

test("workspace RPC uses deterministic P2.2/P2.3 lock order and optimistic touched-row checks", () => {
  const productLock = normalized.indexOf("from public.products as product");
  const skuLock = normalized.indexOf("from public.product_skus as sku", productLock);
  const stale = normalized.indexOf("sku_workspace_stale", skuLock);
  const inventoryLock = normalized.indexOf("from public.digital_inventory as inventory", stale);
  const readiness = normalized.indexOf("public.admin_evaluate_product_sku_activation", inventoryLock);
  const insert = normalized.indexOf("insert into public.product_skus", readiness);
  const update = normalized.indexOf("update public.product_skus as sku", insert);
  assert.ok(productLock >= 0 && skuLock > productLock && stale > skuLock && inventoryLock > stale && readiness > inventoryLock && insert > readiness && update > insert);
  assert.match(normalized, /order by sku\.id for update/);
  assert.match(normalized, /order by inventory\.id for update/);
  assert.match(normalized, /v_existing\.updated_at is distinct from v_expected_updated_at/);
});

test("metadata is never client writable and existing metadata is preserved exactly", () => {
  assert.match(normalized, /unknown_payload_field/);
  assert.doesNotMatch(normalized.match(/where key not in \([^)]*\)/)?.[0] ?? "", /metadata/);
  assert.match(normalized, /'metadata',coalesce\(v_existing\.metadata,'\{\}'::jsonb\)/);
  assert.match(normalized, /\(op->>'sort_order'\)::integer, '\{\}'::jsonb/);
  const updateSet = normalized.slice(normalized.indexOf("update public.product_skus as sku"), normalized.indexOf("returning sku.id", normalized.indexOf("update public.product_skus as sku")));
  assert.doesNotMatch(updateSet, /metadata\s*=/);
});

test("all touched active automatic rows are readiness-checked before any write", () => {
  assert.match(normalized, /where op->>'status' = 'active'/);
  assert.match(normalized, /coalesce\(nullif\(op->>'delivery_type',''\), nullif\(v_product_delivery_type,''\), 'manual'\) = 'automatic'/);
  assert.match(normalized, /where inventory\.product_id = p_product_id and inventory\.sku_id = \(op->>'sku_id'\)::uuid and inventory\.status = 'available'/);
  assert.match(normalized, /if jsonb_array_length\(v_blocked_items\) > 0 then raise exception/);
});

test("code swaps and final duplicate codes fail deterministically before writes", () => {
  assert.match(normalized, /swapping codes is intentionally unsupported/);
  const conflict = normalized.indexOf("swapping codes is intentionally unsupported");
  const insert = normalized.indexOf("insert into public.product_skus", conflict);
  assert.ok(conflict >= 0 && insert > conflict);
  assert.match(normalized, /having count\(\*\) > 1/);
  assert.match(normalized, /message = 'sku_code_conflict'/);
});

test("parent summary matches P2.2/P2.3 and function is service-role-only", () => {
  assert.match(normalized, /sum\(sku\.stock\) filter \(where sku\.status = 'active'\)/);
  assert.match(normalized, /min\(sku\.price\) filter \(where sku\.status = 'active'\)/);
  assert.match(normalized, /update public\.products set has_skus/);
  assert.match(normalized, /security invoker set search_path = pg_catalog/);
  for (const role of ["public", "anon", "authenticated"]) assert.match(normalized, new RegExp(`revoke all on function public\\.admin_save_product_sku_workspace\\(uuid, jsonb\\) from ${role}`));
  assert.match(normalized, /grant execute on function public\.admin_save_product_sku_workspace\(uuid, jsonb\) to service_role/);
});
