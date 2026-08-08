import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..", "..");
const file = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("Daju server client uses only server environment names and never logs credentials or delivery secrets", () => {
  const client = file("lib/providers/daju/client.ts");
  const core = file("lib/providers/daju/client-core.mjs");
  const route = file("app/api/admin/suppliers/daju/route.ts");
  assert.match(client, /import "server-only"/);
  assert.match(client, /DAJU_API_BASE_URL/);
  assert.match(client, /DAJU_API_KEY/);
  assert.doesNotMatch(`${client}\n${core}\n${route}`, /console\.(?:log|info|warn)[\s\S]{0,120}(?:apiKey|delivered)/i);
  assert.doesNotMatch(`${client}\n${core}`, /NEXT_PUBLIC_DAJU/);
});

test("paid-order delivery invokes supplier orchestration before local inventory delivery", () => {
  const service = file("lib/delivery/delivery-service.ts");
  const supplierIndex = service.indexOf("fulfillDajuOrderWithSupabase");
  const localIndex = service.indexOf('supabase.rpc("deliver_digital_order"');
  assert.ok(supplierIndex >= 0 && localIndex > supplierIndex);
  assert.match(service, /supplier\.uncertain > 0/);
  assert.match(service, /supplier\.failed > 0 \|\| supplier\.needsInput > 0/);
});

test("candidate migration persists one request per item and uses existing private delivery boundary", () => {
  const migration = file("supabase/migrations/20260810120000_daju_supplier_fulfillment_v1.sql");
  assert.match(migration, /create table public\.supplier_fulfillment_requests/i);
  assert.match(migration, /unique \(order_item_id\)/i);
  assert.match(migration, /unique \(request_id\)/i);
  assert.match(migration, /attempt_token uuid/i);
  assert.match(migration, /payment_status <> 'paid'/i);
  assert.match(migration, /digital_delivery_secrets/i);
  assert.match(migration, /delivery_type = 'supplier_delivery'/i);
  assert.match(migration, /supplier_fulfillment_requests[\s\S]*enable row level security/i);
  assert.match(migration, /revoke all privileges[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/i);
  assert.match(migration, /fulfillment_source[\s\S]*supplier[\s\S]*daju/i);
  assert.match(migration, /v_supplier_delivery boolean/i);
  assert.match(migration, /if v_auto_delivery and not v_supplier_delivery then/i);
  assert.match(migration, /'supplier_binding'/i);
  assert.doesNotMatch(migration, /create table public\.(?:digital_delivery|delivery_secret|wallet_accounts)/i);
});

test("runtime trusts the immutable order-item supplier snapshot instead of later product metadata", () => {
  const fulfillment = file("lib/providers/daju/fulfillment.ts");
  assert.match(fulfillment, /product_snapshot/);
  assert.match(fulfillment, /snapshot\.supplier_binding/);
  assert.match(fulfillment, /parseDajuProductBinding\(snapshotBinding\)/);
  assert.doesNotMatch(fulfillment, /parseDajuProductBinding\(product\.metadata/);
});

test("candidate migration never exposes supplier delivery content in logs", () => {
  const migration = file("supabase/migrations/20260810120000_daju_supplier_fulfillment_v1.sql");
  for (const block of migration.match(/perform public\.write_delivery_log\([\s\S]*?\);/gi) ?? []) {
    assert.doesNotMatch(block, /p_delivery_content/);
  }
  assert.match(migration, /'provider_order_code_present',true/);
});

test("public delivery remains ownership-scoped and does not query private tables directly", () => {
  const userRoute = file("app/api/orders/[orderNo]/delivery/route.ts");
  const fulfillmentRoute = file("app/api/orders/[orderNo]/fulfillment/route.ts");
  assert.match(userRoute, /get_order_delivery_for_user/);
  assert.match(fulfillmentRoute, /get_order_fulfillment_for_user/);
  assert.doesNotMatch(`${userRoute}\n${fulfillmentRoute}`, /from\("(?:digital_delivery_secrets|supplier_fulfillment_requests)"\)/);
});

test("Daju product binding is metadata-only and never synchronizes supplier cost into Jianlian sale price", () => {
  const binding = file("app/api/admin/suppliers/daju/bindings/[productId]/route.ts");
  assert.match(binding, /fulfillment_source:\s*"supplier"/);
  assert.match(binding, /supplier:\s*"daju"/);
  assert.match(binding, /supplier_product_id/);
  assert.match(binding, /supplier_max_unit_cost/);
  const update = binding.match(/\.update\(\{[\s\S]*?\}\)/)?.[0] ?? "";
  assert.doesNotMatch(update, /\bprice\b/);
});

test("Daju rollout artifacts are candidate-only and SQL remains unexecuted", () => {
  const rollout = file("docs/daju-supplier-fulfillment-v1-rollout.md");
  assert.match(rollout, /不得执行|DO NOT EXECUTE/i);
  assert.match(rollout, /所有测试使用 mock\/fake HTTP/i);
  assert.match(rollout, /DAJU_API_KEY/);
  assert.match(rollout, /UNCERTAIN/);
  assert.match(rollout, /不得自动重试采购/);
});
