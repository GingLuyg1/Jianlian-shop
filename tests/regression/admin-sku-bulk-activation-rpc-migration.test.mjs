import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261004180000_admin_catalog_transactional_bulk_activation_p2_3.sql", "utf8");
const normalized = migration.replace(/\s+/g, " ").toLowerCase();

test("P2.3 migration is forward-only, transactional and data-neutral at install time", () => {
  assert.match(migration, /^-- Forward-only:/);
  assert.match(normalized, /begin;.*create or replace function public\.admin_bulk_activate_product_skus.*commit;/);
  assert.doesNotMatch(normalized, /insert into public\.(?:products|product_skus|digital_inventory)/);
  assert.doesNotMatch(normalized, /delete from public\.(?:products|product_skus|digital_inventory)/);
  assert.doesNotMatch(normalized, /create trigger|alter table|create index/);
});

test("activation RPC validates dangerous input and exposes no target status override", () => {
  for (const code of ["BULK_SKU_PRODUCT_ID_REQUIRED", "EMPTY_SKU_SELECTION", "SKU_BATCH_LIMIT_EXCEEDED", "NULL_SKU_ID", "DUPLICATE_SKU_ID", "PRODUCT_NOT_FOUND", "BULK_SKU_OWNERSHIP_MISMATCH"]) {
    assert.match(migration, new RegExp(code));
  }
  assert.match(normalized, /array_length\(p_sku_ids, 1\) > 100/);
  assert.doesNotMatch(normalized, /p_target_status|p_force|p_override|p_readiness/);
});

test("activation RPC locks all authoritative state before readiness and update", () => {
  const productLock = normalized.indexOf("from public.products");
  const skuLock = normalized.indexOf("from public.product_skus as sku", productLock);
  const inventoryLock = normalized.indexOf("from public.digital_inventory as inventory", skuLock);
  const readiness = normalized.indexOf("public.admin_evaluate_product_sku_activation", inventoryLock);
  const blocked = normalized.indexOf("if v_blocked_count > 0", readiness);
  const update = normalized.indexOf("update public.product_skus as sku", blocked);
  assert.ok(productLock >= 0 && skuLock > productLock && inventoryLock > skuLock && readiness > inventoryLock && blocked > readiness && update > blocked);
  assert.match(normalized, /order by sku\.id for update/);
  assert.match(normalized, /order by inventory\.id for update/);
});

test("readiness matches exact SKU evidence and never uses parent stock or binding", () => {
  assert.match(normalized, /sku\.stock/);
  assert.match(normalized, /sku\.metadata/);
  assert.match(normalized, /inventory\.sku_id = sku\.id/);
  assert.match(normalized, /inventory\.status = 'available'/);
  assert.match(normalized, /supplier_stock_snapshot/);
  assert.match(normalized, /supplier_stock_sync_status/);
  assert.match(normalized, /supplier_stock_last_success_at/);
  assert.match(normalized, /supplier_stock_stale/);
  assert.match(normalized, /inventory_state/);
  assert.doesNotMatch(normalized, /products\.stock/);
  assert.doesNotMatch(normalized, /products\.metadata/);
});

test("readiness evaluator is STABLE and uses canonical JSON numeric evidence", () => {
  const evaluator = normalized.match(/create or replace function public\.admin_evaluate_product_sku_activation[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(evaluator, /language plpgsql stable security invoker set search_path = pg_catalog/);
  assert.doesNotMatch(evaluator, /\bimmutable\b|security definer/);

  for (const field of ["supplier_product_id", "supplier_stock_snapshot"]) {
    assert.match(evaluator, new RegExp(`jsonb_typeof\\(v_metadata->'${field}'\\) = 'number'`));
  }
  assert.match(evaluator, /v_product_id_numeric <= 9007199254740991/);
  assert.match(evaluator, /trunc\(v_product_id_numeric\) = v_product_id_numeric/);
  assert.match(evaluator, /v_snapshot_numeric <= 9007199254740991/);
  assert.match(evaluator, /trunc\(v_snapshot_numeric\) = v_snapshot_numeric/);
  assert.doesNotMatch(evaluator, /supplier_(?:product_id|stock_snapshot)'?\)?\s*!?~?\s*'\^\[1-9\]\[0-9\]\*\$'/);
});

test("readiness evaluator accepts only timezone-explicit canonical supplier timestamps", () => {
  const evaluator = normalized.match(/create or replace function public\.admin_evaluate_product_sku_activation[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(evaluator, /jsonb_typeof\(v_metadata->'supplier_stock_last_success_at'\) = 'string'/);
  assert.match(evaluator, /\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}t/);
  assert.match(evaluator, /\(z\|\[\+-\]\[0-9\]\{2\}:\[0-9\]\{2\}\)\$/);
  assert.match(evaluator, /supplier_stock_last_success_at'\)::timestamptz/);
  assert.match(evaluator, /exception when others then/);
});

test("blocked rows return before the only activation update and summary stays transactional", () => {
  assert.match(normalized, /'code', 'bulk_activation_not_ready'/);
  assert.match(normalized, /'updated_count', 0/);
  assert.match(normalized, /if v_blocked_count > 0 then return jsonb_build_object/);
  assert.match(normalized, /set status = 'active'/);
  assert.equal(normalized.match(/set status = 'active'/g)?.length, 1);
  assert.match(normalized, /sum\(sku\.stock\) filter \(where sku\.status = 'active'\)/);
  assert.match(normalized, /min\(sku\.price\) filter \(where sku\.status = 'active'\)/);
  assert.match(normalized, /update public\.products set has_skus/);
});

test("already-active rows are no-change and do not enter readiness blocking", () => {
  assert.match(normalized, /where status <> 'active'/);
  assert.match(normalized, /and sku\.status = 'active'/);
  assert.match(normalized, /'no_change_count', v_no_change_count/);
});

test("activation functions are invoker-rights, fixed-search-path and service-role-only", () => {
  assert.equal((normalized.match(/security invoker set search_path = pg_catalog/g) ?? []).length, 2);
  assert.doesNotMatch(normalized, /security definer|auth\.role\(/);
  for (const signature of [
    "public.admin_evaluate_product_sku_activation(text, text, integer, jsonb, bigint)",
    "public.admin_bulk_activate_product_skus(uuid, uuid[])",
  ]) {
    assert.match(normalized, new RegExp(`revoke all on function ${signature.replace(/[()[\]]/g, "\\$&")} from public`));
    assert.match(normalized, new RegExp(`revoke all on function ${signature.replace(/[()[\]]/g, "\\$&")} from anon`));
    assert.match(normalized, new RegExp(`revoke all on function ${signature.replace(/[()[\]]/g, "\\$&")} from authenticated`));
    assert.match(normalized, new RegExp(`grant execute on function ${signature.replace(/[()[\]]/g, "\\$&")} to service_role`));
  }
});

test("P2.2 generic status RPC still rejects active and inactive", () => {
  const previous = readFileSync("supabase/migrations/20261004120000_admin_catalog_transactional_bulk_status_p2_2.sql", "utf8").replace(/\s+/g, " ").toLowerCase();
  assert.match(previous, /p_target_status not in \('draft', 'sold_out'\)/);
  assert.doesNotMatch(previous.match(/if p_target_status.*?end if;/)?.[0] ?? "", /active|inactive/);
});
