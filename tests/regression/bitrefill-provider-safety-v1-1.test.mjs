import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const file = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const route = file("app/api/webhooks/bitrefill/route.ts");
const activeRouter = file("lib/providers/core/supplier-router.ts");
const transport = file("lib/providers/bitrefill/transport.mjs");
const provider = file("lib/providers/bitrefill/provider-core.mjs");
const genericMigration = file("supabase/migrations/20260826190000_supplier_fulfillment_core_v1.sql");
const mockCatalog = file("lib/mock-data.ts");

test("active fulfillment router remains Daju-only while Bitrefill is discoverable read-only", () => {
  const registry = activeRouter.match(/const SUPPLIER_REGISTRY[\s\S]*?\n};/)?.[0] ?? "";
  assert.match(registry, /daju:\s*fulfillDajuOrderWithSupabase/);
  assert.doesNotMatch(registry, /bitrefill/);
  assert.match(activeRouter, /discoverSupplierProvider/);
});

test("Bitrefill transport cannot contain an outbound mutating HTTP request", () => {
  assert.match(transport, /READ_ONLY_MODE_METHOD_BLOCKED/);
  assert.doesNotMatch(transport, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
  assert.doesNotMatch(transport, /auto_pay|payment_method|accounts\/deposit|brgc-batches/);
  assert.match(provider, /transport\.kind !== "fake"/);
  assert.match(provider, /PURCHASE_DISABLED/);
});

test("webhook remains a bounded wake-up signal with no mutation or secret output", () => {
  assert.match(route, /MAX_WEBHOOK_BYTES = 64 \* 1024/);
  assert.match(route, /side_effects: false/);
  assert.match(route, /authenticate GET/);
  assert.doesNotMatch(route, /getSupabase|service_role|\.from\(|\.insert\(|\.update\(|redemption_info|console\./);
  assert.doesNotMatch(route, /webhook[_-]?secret|createHmac|timingSafeEqual/);
});

test("generic supplier DB contract preserves local inventory priority and service-role delivery boundary", () => {
  assert.match(genericMigration, /create or replace function public\.reserve_local_inventory_for_supplier_order/);
  assert.match(genericMigration, /digital_delivery_secrets/);
  assert.match(genericMigration, /SUPPLIER_FULFILLMENT_SERVICE_ROLE_REQUIRED/);
  assert.match(genericMigration, /grant execute on function public\.reserve_local_inventory_for_supplier_order\(uuid,text\) to service_role/);
});

test("Apple catalog entry remains unbound, out of stock and unchanged by Bitrefill integration", () => {
  const apple = mockCatalog.match(/\{\s*id: "gift-apple-us",[\s\S]*?\n  \},/)?.[0] ?? "";
  assert.match(apple, /stockStatus: "out-of-stock"/);
  assert.match(apple, /stockLabel: "库存：0"/);
  assert.match(apple, /listingStatus: "active"/);
  assert.doesNotMatch(apple, /bitrefill|supplier_binding|supplier_product_id|supplier_sku/);
});

test("new Bitrefill runtime sources do not log or serialize redemption secrets", () => {
  assert.doesNotMatch(`${transport}\n${provider}`, /console\.(?:log|info|warn|error)/);
  assert.doesNotMatch(provider, /JSON\.stringify\([^)]*redemption/i);
  assert.match(provider, /storage: "digital_delivery_secrets"/);
});
