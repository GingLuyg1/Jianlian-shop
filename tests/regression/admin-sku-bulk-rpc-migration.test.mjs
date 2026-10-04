import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261004120000_admin_catalog_transactional_bulk_status_p2_2.sql", "utf8");
const normalized = migration.replace(/\s+/g, " ").toLowerCase();

test("bulk status migration is transactional, forward-only and data-neutral at install time", () => {
  assert.match(migration, /^-- Forward-only:/);
  assert.match(normalized, /begin;.*create or replace function.*commit;/);
  assert.doesNotMatch(normalized, /insert into public\.product_skus/);
  assert.doesNotMatch(normalized, /delete from public\.product_skus/);
});

test("RPC validates every dangerous input at the database boundary", () => {
  for (const code of ["EMPTY_SKU_SELECTION", "SKU_BATCH_LIMIT_EXCEEDED", "NULL_SKU_ID", "DUPLICATE_SKU_ID", "BULK_STATUS_TARGET_NOT_ALLOWED"]) {
    assert.match(migration, new RegExp(code));
  }
  assert.match(normalized, /array_length\(p_sku_ids, 1\) > 100/);
  assert.match(normalized, /p_target_status not in \('draft', 'sold_out'\)/);
  const targetGuard = normalized.match(/if p_target_status.*?end if;/)?.[0] ?? "";
  assert.doesNotMatch(targetGuard, /active|inactive/);
});

test("RPC locks and validates exact ownership before the update", () => {
  const lockAt = normalized.indexOf("for update");
  const countAt = normalized.indexOf("v_matched_count <> v_selected_count");
  const updateAt = normalized.indexOf("update public.product_skus");
  assert.ok(lockAt >= 0 && countAt > lockAt && updateAt > countAt);
  assert.match(normalized, /order by id for update/);
  assert.match(migration, /BULK_SKU_OWNERSHIP_MISMATCH/);
});

test("RPC uses invoker privileges, a fixed search path, and service-role-only execution grants", () => {
  assert.match(normalized, /security invoker set search_path = pg_catalog/);
  assert.doesNotMatch(normalized, /security definer|auth\.role\(/);
  assert.match(normalized, /revoke all on function .* from public/);
  assert.match(normalized, /revoke all on function .* from anon/);
  assert.match(normalized, /revoke all on function .* from authenticated/);
  assert.match(normalized, /grant execute on function .* to service_role/);
});

test("parent SKU summary is recomputed inside the same function transaction", () => {
  assert.match(normalized, /sum\(stock\) filter \(where status = 'active'\)/);
  assert.match(normalized, /min\(price\) filter \(where status = 'active'\)/);
  assert.match(normalized, /update public\.products set has_skus/);
  assert.match(normalized, /'product_summary'/);
});
