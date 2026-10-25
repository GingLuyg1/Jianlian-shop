import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createMemoryMockBackend } from "../../scripts/support/bitrefill-mock-store.mjs";
import { catalogFixture, syntheticAftercareState } from "../support/bitrefill-catalog-fixture.mjs";
import { runMappingV4Cases, runAftercareHttpCases } from "../support/bitrefill-mapping-v4-cases.mjs";
import { catalogQuery, createBitrefillCatalogManager } from "../../lib/providers/bitrefill/catalog-management.mjs";
import { createPersonalCatalogClient } from "../../lib/providers/bitrefill/personal-catalog-client.mjs";
import { projectBitrefillAftercare, readBitrefillAftercare } from "../../lib/admin/bitrefill-aftercare.mjs";
import { createLocalBitrefillMappingService } from "../../lib/providers/bitrefill/local-mapping.mjs";
import { mockAdminReadClient } from "../../scripts/support/bitrefill-mock-view.mjs";
import ts from "typescript";
import { createWorkspaceBackend } from "../../scripts/support/bitrefill-workspace-backend.mjs";

test("V4 mapping, review, costs, range, CAS, HTTP and no-financial-action integration", async () => {
  const result = await runMappingV4Cases(createMemoryMockBackend()); assert.ok(result.checks >= 35);
});
test("V4 partial failure / supplier refund requires manual notes, never customer refund", async () => {
  assert.equal((await runAftercareHttpCases(createMemoryMockBackend())).actualFinancialMutations, 0);
});
test("V4 catalog applies search, country, supplier type and availability before pagination", async () => {
  const { catalog, calls } = catalogFixture();
  const first = await catalog.list({ country: "US", pageSize: 2 }); assert.equal(first.total, 28); assert.ok(first.hasMore);
  const second = await catalog.list({ country: "US", pageSize: 2, page: 2 }); assert.notEqual(first.products[0].id, second.products[0].id);
  const filtered = await catalog.list({ country: "US", category: "mobile_refill", stock: "unavailable", q: "Other", pageSize: 5, page: 2 });
  assert.equal(filtered.total, 12); assert.equal(filtered.products.length, 5); assert.ok(filtered.products.every((p) => !p.available));
  assert.equal(calls.filter((c) => c.kind === "catalog").length, 1);
  assert.equal((await catalog.list({ country: "CA" })).products[0].currency, "CAD");
  assert.equal((await catalog.list({ q: "not-found" })).total, 0);
  const detail = await catalog.detail("mock-many-us"); assert.equal(detail.product.packages.length, 296);
  const price = await catalog.detail("mock-apple-us"); assert.equal(price.product.packages[0].catalogPrice, 12345); assert.equal(price.product.packages[0].trustedCost, null);
  for (const params of [{ country: "usa" }, { stock: "fake" }, { page: -1 }, { pageSize: 100 }, { q: "<script>" }]) assert.throws(() => catalogQuery(params));
});
test("V4 catalog TTL, concurrent deduplication, caps, upstream errors and stale review fail closed", async () => {
  let now = 1000000, calls = 0;
  const f = catalogFixture(); const client = { ...f.client, listProductsBounded: async (o) => { calls++; return { ...await f.client.listProductsBounded(o), truncated: true }; } };
  const manager = createBitrefillCatalogManager(client, { now: () => now, ttlMs: 10 });
  const values = await Promise.all([0, 1, 2].map(() => manager.list({}))); assert.equal(calls, 1); assert.ok(values.every((v) => v.truncated));
  now += 11; await manager.list({}); assert.equal(calls, 2);
  const bad = createBitrefillCatalogManager({ ...client, listProductsBounded: async () => { throw Error("RATE_LIMITED"); } });
  await assert.rejects(() => bad.list({}), /RATE_LIMITED/);
  const mismatch = createBitrefillCatalogManager({ ...client, getProduct: () => f.client.getProduct("mock-apple-us") });
  await assert.rejects(() => mismatch.detail("mock-amazon-us"), /IDENTITY_MISMATCH/);
  const backend = { ...createMemoryMockBackend(), scope: "bitrefill_local_workspace" };
  const service = createLocalBitrefillMappingService({ backend, catalog: { detail: async () => ({ ...await f.catalog.detail("mock-apple-us"), checkedAt: "2000-01-01T00:00:00Z" }) } });
  await assert.rejects(() => service.save({ skuId: "mock", productId: "mock-apple-us", mode: "package", status: "draft", reviewNote: "MOCK review", expectedVersion: 0 }, "mock-admin"), /CATALOG_STALE/);
});
test("V4 Personal catalog client is product GET-only with redirects forbidden", async () => {
  const f = catalogFixture(), calls = [];
  const client = createPersonalCatalogClient("SYNTHETIC_TEST_KEY", async (url, options) => {
    calls.push({ path: url.pathname, method: options.method, redirect: options.redirect });
    return new Response(JSON.stringify({ data: f.raw[0] }), { headers: { "Content-Type": "application/json" } });
  });
  await client.getProduct("mock-apple-us"); assert.deepEqual(calls, [{ path: "/v2/products/mock-apple-us", method: "GET", redirect: "error" }]);
  await assert.rejects(() => client.ping());
  assert.equal(calls.length, 1); assert.equal(client.purchase, undefined);
});
test("V4 exception projection does not expose secrets or equate invoice complete to private delivery", async () => {
  const s = syntheticAftercareState(); s.supplier_purchase_attempts[0].invoice_status = "complete";
  s.supplier_external_orders[0].redemption = { code: "MOCK-SECRET-NOT-FOR-ADMIN" };
  const projected = projectBitrefillAftercare({ roots: s.supplier_fulfillment_requests, units: s.supplier_purchase_attempt_items,
    attempts: s.supplier_purchase_attempts, children: s.supplier_external_orders, orders: s.orders });
  assert.equal(projected.length, 2); assert.ok(!JSON.stringify(projected).includes("MOCK-SECRET"));
  assert.ok(projected.every((c) => !c.automaticCustomerRefund && !c.automaticRedelivery));
  const manual = projectBitrefillAftercare({ roots: [{ id: "mock-validation", supplier: "bitrefill", order_id: "mock", status: "FAILED_VALIDATION" }], units: [], attempts: [], children: [] });
  assert.equal(manual[0].kind, "MANUAL_REVIEW");
});
test("V4 aftercare snapshot refuses missing exact count or backend truncation", async () => {
  const builder = { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return Promise.resolve({ data: [], count: 1001 }); } };
  await assert.rejects(() => readBitrefillAftercare({ from: () => builder }), /SNAPSHOT_LIMIT/);
});
test("V4 production routes are auth-first GET-only and no payment/production mapping writes", async () => {
  for (const route of ["catalog", "aftercare"]) {
    const source = await readFile(new URL(`../../app/api/admin/suppliers/bitrefill/${route}/route.ts`, import.meta.url), "utf8");
    assert.match(source, /export async function GET/); assert.doesNotMatch(source, /export async function (POST|PATCH|PUT|DELETE)/);
    assert.ok(source.indexOf("await getServerSuperAdminContext") < source.indexOf(route === "catalog" ? "manager = getPersonalCatalogManager()" : "const client = getSupabaseServiceRoleClient()"));
    assert.doesNotMatch(source, /\.rpc\(|\.insert\(|\.update\(/);
  }
  const policy = await readFile(new URL("../../lib/providers/bitrefill/prelaunch-policy.mjs", import.meta.url), "utf8");
  assert.match(policy, /REAL_BITREFILL_PURCHASE_ENABLED = false/);
  const router = await readFile(new URL("../../lib/providers/core/supplier-router.ts", import.meta.url), "utf8");
  assert.doesNotMatch(router, /catalog-management|local-mapping|catalog-workspace/);
});
test("V4 actual Next GET handlers deny non-super-admin before acquiring clients", async () => {
  for (const name of ["catalog", "aftercare"]) {
    const source = await readFile(new URL(`../../app/api/admin/suppliers/bitrefill/${name}/route.ts`, import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    let access = { ok: false, status: 401, message: "MOCK_LOGIN_REQUIRED" }, clients = 0;
    const state = { ...syntheticAftercareState(), evidence: [] };
    const dependencies = { "next/server": { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), options) } },
      "@/lib/auth/require-admin": { getServerSuperAdminContext: async () => access },
      "@/lib/supabase/service-role": { getSupabaseServiceRoleClient: () => { clients++; return mockAdminReadClient(state); } },
      "@/lib/admin/bitrefill-aftercare.mjs": { readBitrefillAftercare },
      "@/lib/providers/bitrefill/catalog-server": { getPersonalCatalogManager: () => { clients++; return catalogFixture().catalog; } } };
    const compiledModule = { exports: {} };
    new Function("require", "module", "exports", compiled)((n) => { assert.ok(n in dependencies); return dependencies[n]; }, compiledModule, compiledModule.exports);
    const request = () => new Request("http://127.0.0.1/local-test");
    assert.equal((await compiledModule.exports.GET(request())).status, 401);
    access = { ok: false, status: 403, message: "MOCK_SUPER_ADMIN_REQUIRED" };
    assert.equal((await compiledModule.exports.GET(request())).status, 403); assert.equal(clients, 0);
    access = { ok: true };
    const r = await compiledModule.exports.GET(request()); assert.equal(r.status, 200); assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(clients, 1); assert.equal(compiledModule.exports.POST, undefined);
  }
});
test("V4 aftercare read preserves complete orders, pagination, Daju exclusion and projection allowlist", async () => {
  const state = { ...syntheticAftercareState(), evidence: [] };
  const initial = await readBitrefillAftercare(mockAdminReadClient(state));
  assert.deepEqual(initial.cases.map((c) => c.kind).sort(), ["PARTIAL_FAILURE", "SUPPLIER_REFUNDED"]);
  for (let i = 0; i < 26; i++) state.supplier_fulfillment_requests.push({ id: `mock-root-page-${i}`, supplier: "bitrefill", order_id: `mock-order-page-${i}`, status: "FAILED_VALIDATION" });
  const pages = await Promise.all([1, 2].map((p) => readBitrefillAftercare(mockAdminReadClient(state), p)));
  assert.ok(pages[0].hasMore); assert.equal(pages[1].hasMore, false);
  assert.equal(new Set(pages.flatMap((p) => p.cases.map((c) => c.id))).size, 28);
});
test("V4 catalog rejects undeclared oversized chunked bodies before unbounded text buffering", async () => {
  let cancelled = false;
  const client = createPersonalCatalogClient("SYNTHETIC_TEST_KEY", async () => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(128 * 1024)); }, cancel() { cancelled = true; }
  }), { headers: { "content-type": "application/json" } }));
  await assert.rejects(() => client.getProduct("mock-apple-us")); assert.equal(cancelled, true);
});
test("V4 local metadata persists across restart, refuses duplicate writer and rolls back failed writes", async () => {
  const directory = `D:/Jianlian/_bitrefill_catalog_mapping_v4_20261025/persistence-${randomUUID()}`;
  await mkdir("D:/Jianlian/_bitrefill_catalog_mapping_v4_20261025", { recursive: true });
  const backend = await createWorkspaceBackend(directory);
  try {
    await backend.transact((s) => { s.syntheticMarker = "MOCK_METADATA_ONLY"; });
    await assert.rejects(() => createWorkspaceBackend(directory), { code: "EEXIST" });
    await assert.rejects(() => backend.transact((s) => { s.syntheticMarker = "NOT_COMMITTED"; throw Error("MOCK_ROLLBACK"); }), /MOCK_ROLLBACK/);
    assert.equal((await backend.read()).syntheticMarker, "MOCK_METADATA_ONLY");
  } finally { await backend.close(); }
  const restarted = await createWorkspaceBackend(directory);
  try { assert.equal((await restarted.read()).syntheticMarker, "MOCK_METADATA_ONLY"); }
  finally { await restarted.close(); }
  await assert.rejects(() => createWorkspaceBackend("D:/Jianlian/Jianlian-shop-bitrefill-final-connect-v1"), /PATH_NOT_ALLOWED/);
});
