import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261015063415_supplier_purchase_persistence_v1_3.sql", import.meta.url),
  "utf8",
);
const precheck = readFileSync(
  new URL("../../docs/integrations/sql/bitrefill-v1-3-production-precheck.sql", import.meta.url),
  "utf8",
);

test("V1.3 supplier persistence is provider-neutral and keeps existing delivery ownership", () => {
  for (const name of [
    "supplier_purchase_attempts",
    "supplier_purchase_attempt_items",
    "supplier_external_orders",
    "supplier_webhook_receipts",
    "supplier_reconciliation_evidence",
  ]) assert.match(migration, new RegExp(`create table public\\.${name}\\b`, "i"));
  assert.doesNotMatch(migration, /create table public\.bitrefill_/i);
  assert.match(migration, /references public\.supplier_fulfillment_requests\(id\) on delete restrict/i);
  assert.match(migration, /references public\.order_deliveries\(id\) on delete restrict/i);
  assert.doesNotMatch(migration, /\b(?:delete|truncate)\s+(?:from\s+)?public\.(?:order_items|orders|order_deliveries|digital_delivery_secrets)\b/i);
});

test("V1.3 SQL records a no-blind-retry submit boundary and immutable identities", () => {
  assert.match(migration, /semantic_request_hash text not null check \(semantic_request_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/i);
  assert.match(migration, /'CLAIMED','SUBMITTING','UNCERTAIN','EXTERNAL_CREATED'/);
  assert.match(migration, /supplier_purchase_attempts_external_invoice_uidx/);
  assert.match(migration, /unique \(supplier, external_order_id\)/i);
  assert.match(migration, /unique \(fulfillment_request_id, unit_index\)/i);
  assert.match(migration, /supplier_purchase_guard_attempt_update/);
  assert.match(migration, /SUPPLIER_PURCHASE_INVOICE_UNIT_LIMIT/);
  assert.match(migration, /SUPPLIER_EXTERNAL_ORDER_DELIVERY_ITEM_MISMATCH/);
  assert.doesNotMatch(migration.replace(/^--.*$/gm, ""), /authorization|api[_ -]?key|redemption[_ -]?code|raw[_ -]?payload/i);
});

test("V1.3 candidate denies browser writes and grants only narrow server RPCs", () => {
  assert.equal((migration.match(/enable row level security;/gi) ?? []).length, 5);
  assert.match(migration, /from public, anon, authenticated;/i);
  assert.match(migration, /grant select on public\.supplier_purchase_attempts[\s\S]*to service_role;/i);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all) on public\.supplier_purchase_attempts/i);
  for (const name of [
    "internal_supplier_purchase_claim", "internal_supplier_purchase_transition",
    "internal_supplier_purchase_record_child", "internal_supplier_purchase_record_evidence",
    "internal_supplier_purchase_record_webhook", "internal_supplier_purchase_deliver_child",
  ]) assert.match(migration, new RegExp(`create function public\\.${name}\\(`));
  assert.match(migration, /security definer set search_path = pg_catalog/i);
  assert.match(migration, /grant execute on function public\.internal_supplier_purchase_claim[\s\S]*to service_role;/i);
  assert.match(migration, /SUPPLIER_PURCHASE_ORDER_NOT_PURCHASABLE/);
  assert.match(migration, /SUPPLIER_PURCHASE_SEMANTIC_CONFLICT/);
  assert.match(migration, /SUPPLIER_PURCHASE_PREFLIGHT_DUPLICATE_EXTERNAL_INVOICE/);
  assert.match(migration, /record_supplier_fulfillment_outcome\(/);
  assert.match(migration, /update public\.supplier_external_orders set delivery_id=v_delivery_id/);
  assert.match(migration, /create or replace function public\.admin_evaluate_product_sku_activation/i);
  assert.match(migration.replace(/^--.*$/gm, "").trim(), /^begin;[\s\S]*commit;$/i);
});

test("current-schema production precheck is read-only and diagnoses scoped drift", () => {
  assert.match(precheck, /begin transaction read only;/i);
  assert.match(precheck, /d1e335c5e80c09f7f48d022a40092e8b71d18cc1d383c639677f9d82a8b48fbb/);
  assert.match(precheck, /pg_get_constraintdef/);
  assert.match(precheck, /pg_get_functiondef/);
  assert.match(precheck, /relrowsecurity/);
  assert.match(precheck, /provider_order_code/);
  assert.match(precheck, /'orphan_root', count\(\*\)/);
  assert.match(precheck, /'duplicate_delivered_item', count\(\*\)/);
  assert.doesNotMatch(precheck, /orphan_root_id|missing_binding_root_id|select\s+\*\s+from\s+public\.digital_delivery_secrets/i);
  assert.doesNotMatch(precheck.replace(/^--.*$/gm, ""), /\b(?:insert|update|delete|alter|create|drop|truncate)\s+(?:table\s+|from\s+)?public\./i);
});
