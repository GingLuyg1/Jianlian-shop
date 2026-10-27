import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryMockBackend } from "../../scripts/support/bitrefill-mock-store.mjs";
import { catalogFixture } from "../support/bitrefill-catalog-fixture.mjs";
import { runUnifiedBindingCases, bindingInput, initializeBindingFixture, bindingFixtureService, saveBitrefillSkuBinding, loadBindingRoutes } from "../support/bitrefill-binding-v5-fixture.mjs";
import { createPersonalCatalogClient } from "../../lib/providers/bitrefill/personal-catalog-client.mjs";
import { createBitrefillCatalogManager } from "../../lib/providers/bitrefill/catalog-management.mjs";
import { parseBitrefillProduct } from "../../lib/providers/bitrefill/protocol.mjs";
test("V5 actual Daju and Bitrefill save handlers: same SKU metadata, CAS, audit, multiple SKUs and frozen orders", async () => {
  assert.ok((await runUnifiedBindingCases(createMemoryMockBackend())).checks >= 30);
});
test("V5 official search uses GET products/search with global results and explicit US/XI filtering", async () => {
  const { raw } = catalogFixture(), calls = [];
  const client = createPersonalCatalogClient("SYNTHETIC_TEST_KEY", async (url, options) => {
    calls.push({ path: url.pathname, q: url.searchParams.get("q"), country: url.searchParams.get("country"), method: options.method });
    return new Response(JSON.stringify({ data: [raw[0], { ...raw[1], country: "XI" }, { ...raw[0], id: "mock-apple-gb", country: "GB" }], meta: { start: 0, limit: 50, total: 3 } }), { headers: { "content-type": "application/json" } });
  });
  const m = createBitrefillCatalogManager(client);
  assert.equal((await m.list({ q: "Apple", includeInternational: true })).total, 2);
  assert.equal((await m.list({ q: "Apple" })).total, 1);
  assert.ok(calls.every((c) => c.path === "/v2/products/search" && c.country === null && c.method === "GET"));
});
test("V5 pagination follows total without _next and reports actual cap, never follows external next URL", async () => {
  const p = catalogFixture().raw[0]; const starts = [];
  const client = createPersonalCatalogClient("SYNTHETIC_TEST_KEY", async (url) => {
    const start = Number(url.searchParams.get("start")); starts.push(start);
    return new Response(JSON.stringify({ data: Array.from({ length: start === 0 ? 50 : 1 }, (_, i) => ({ ...p, id: `mock-page-${start + i}` })), meta: { start, limit: 50, total: 51 } }), { headers: { "content-type": "application/json" } });
  });
  const full = await client.listProductsBounded({ country: "US,XI", maxPages: 2 }); assert.equal(full.products.length, 51); assert.equal(full.truncated, false);
  const capped = await client.listProductsBounded({ country: "US", maxPages: 1 }); assert.equal(capped.truncated, true); assert.deepEqual(starts, [0, 50, 0]);
});
test("V5 Unicode non-monetary labels display safely, categories never imply product type or valid denomination", () => {
  const p = parseBitrefillProduct({ ...catalogFixture().raw[0], type: undefined, categories: ["games", "giftcard"], packages: [{ id: "mock-coins", value: "100 eFootball™ 硬币", price: 1 }] });
  assert.equal(p.type, "unknown"); assert.deepEqual(p.categories, ["games", "giftcard"]); assert.equal(p.packages[0].value, null);
  assert.equal(parseBitrefillProduct({ ...catalogFixture().raw[0], packages: [{ id: "mock", value: "<script>" }] }), null);
});
test("V5 range/fee/currency/unknown-type review stays fail closed", async () => {
  const backend = createMemoryMockBackend(); await initializeBindingFixture(backend);
  const service = bindingFixtureService(backend), { catalog, products } = catalogFixture(); let sku = (await backend.read()).product_skus[0];
  const d = await catalog.detail("mock-amazon-us");
  const base = await bindingInput(catalog, sku, { supplier_product_id: d.product.id, catalog_fingerprint: d.fingerprint, mode: "range", supplier_package_id: null, range_value: "10",
    sku_facts: { country: "US", currency: "USD", face_value: "10" }, configured_cost: "9.80", cost_currency: "USD", configured_fees: "0.20" });
  const args = { service, productId: "mock-web-product", catalog, actor: "mock-admin" };
  await assert.rejects(() => saveBitrefillSkuBinding({ ...args, input: { ...base, range_value: "10.1" } }), /RANGE_STEP/);
  const saved = await saveBitrefillSkuBinding({ ...args, input: base }); assert.equal(saved.financials.estimatedProfit, null);
  sku = saved.sku; products.find((p) => p.id === "mock-amazon-us").type = "unknown";
  const changed = await catalog.detail("mock-amazon-us");
  await assert.rejects(() => saveBitrefillSkuBinding({ ...args, input: { ...base, expected_updated_at: sku.updated_at, expected_binding_version: 1,
    catalog_fingerprint: changed.fingerprint, review_status: "manual_reviewed_unverified", identity_confirmed: true, denomination_confirmed: true, brand_country_confirmed: true } }), /TYPE_UNVERIFIED/);
});
test("V5 authenticated mutations enforce origin, bounded body and owned SKU before writes", async () => {
  const backend = createMemoryMockBackend(); await initializeBindingFixture(backend);
  const service = bindingFixtureService(backend), catalog = catalogFixture().catalog, routes = await loadBindingRoutes(service, catalog);
  const request = (body, headers) => new Request("http://127.0.0.1/api/test", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  const ctx = { params: { productId: "mock-web-product" } };
  assert.equal((await routes.bitrefill.POST(request({}, { Origin: "https://foreign.invalid" }), ctx)).status, 403);
  assert.equal((await routes.bitrefill.POST(request({}, {}), ctx)).status, 403);
  assert.equal((await routes.bitrefill.POST(request({ large: "x".repeat(13000) }, { Origin: "http://127.0.0.1" }), ctx)).status, 409);
  assert.equal(routes.stats.clients, 0); assert.equal(service.writes.length, 0);
  const sku = (await backend.read()).product_skus[0], input = await bindingInput(catalog, sku);
  const foreignSku = await routes.bitrefill.POST(request({ ...input, website_sku_id: "mock-not-owned" }, { Origin: "http://127.0.0.1" }), ctx);
  assert.equal(foreignSku.status, 409); assert.equal(service.writes.length, 0);
  // Reverse proxy preserves Host while Next's internal request URL may differ.
  const proxy = await routes.bitrefill.POST(request(input, { Origin: "https://mock-shop.invalid", Host: "mock-shop.invalid" }), ctx);
  assert.equal(proxy.status, 200); assert.equal((await proxy.json()).realPurchaseEnabled, false);
});
