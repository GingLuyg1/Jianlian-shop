import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260826190000_supplier_fulfillment_core_v1.sql";

test("generic supplier database contract preserves immutable routing and Daju compatibility", () => {
  assert.ok(fs.existsSync(migrationPath), "supplier fulfillment candidate migration missing");
  const sql = fs.readFileSync(migrationPath, "utf8");
  assert.ok(sql.includes("alter column supplier_product_id type text"));
  assert.ok(sql.includes("create or replace function public.claim_supplier_fulfillment("));
  assert.ok(sql.includes("p_supplier text"));
  assert.ok(sql.includes("p_supplier_product_id text"));
  assert.ok(sql.includes("create or replace function public.record_supplier_fulfillment_outcome("));
  assert.ok(sql.includes("SUPPLIER_FULFILLMENT_ORDER_SNAPSHOT_INVALID"));
  assert.ok(sql.includes("create or replace function public.claim_daju_supplier_fulfillment("));
  assert.ok(sql.includes("create or replace function public.record_daju_supplier_fulfillment_outcome("));
  assert.ok(sql.includes("create or replace function public.reserve_local_inventory_for_supplier_order("));
  assert.ok(sql.includes("supplier_fulfillment_requests"));
  assert.ok(sql.includes("service_role"));
  assert.ok(sql.includes("SUPPLIER_FULFILLMENT_REQUIRED_DEPENDENCY_MISSING"));
  assert.ok(sql.includes("create or replace function public.reserve_local_inventory_for_daju_order("));
  assert.ok(sql.includes("do $patch_local_delivery$"));
  assert.ok(sql.includes("SUPPLIER_LOCAL_PRIORITY_DELIVERY_CONTRACT_DRIFT"));
  assert.ok(sql.includes("grant execute on function public.claim_supplier_fulfillment(uuid,uuid,text,text,text,text,text) to service_role;"));
  assert.ok(sql.includes("grant execute on function public.record_supplier_fulfillment_outcome(uuid,uuid,text,text,uuid,text,boolean,text,text,text,numeric,numeric,text) to service_role;"));
  assert.ok(sql.includes("grant execute on function public.reserve_local_inventory_for_supplier_order(uuid,text) to service_role;"));
  assert.ok(sql.includes("DAJU_FULFILLMENT_PRODUCT_ID_COMPAT_GUARD"));
  assert.ok(sql.includes("p_supplier_product_id between 1 and 9223372036854775807"));
});
