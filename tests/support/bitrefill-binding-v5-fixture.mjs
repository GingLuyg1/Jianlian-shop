import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { saveBitrefillSkuBinding } from "../../lib/providers/core/admin-sku-binding.mjs";
import { catalogFixture } from "./bitrefill-catalog-fixture.mjs";
import * as mapper from "../../lib/providers/daju/mapper.mjs";
import * as stock from "../../lib/providers/daju/stock.mjs";
export const dajuDetail = { id: 15, title: "MOCK Daju", price: "8", stock: 69, sales: 0, isAuto: true, isSku: true,
  minQty: 1, maxQty: 10, requiredInputs: [], specs: [], skuVariants: [{ id: 13, title: "MOCK variant", price: "8", stock: 50 }, { id: 14, title: "MOCK second variant", price: "9.5", stock: 19 }] };
export async function initializeBindingFixture(backend) {
  await backend.transact((s) => {
    s.products = [{ id: "mock-web-product", name: "MOCK website product", price: 20, stock: 0, metadata: {}, delivery_type: "automatic", has_skus: true }];
    s.product_skus = ["a", "b"].map((n) => ({ id: `mock-sku-${n}`, product_id: "mock-web-product", sku_title: `MOCK SKU ${n}`, sku_code: `mock-${n}`,
      price: 20, original_price: null, stock: 0, status: "draft", delivery_type: "automatic", metadata: {}, updated_at: "2026-10-25T00:00:00.000Z" }));
    s.frozenBindingOrders = [{ id: "mock-historical-order", product_snapshot: { supplier_binding: { supplier: "daju", supplier_product_id: 15, supplier_sku: "13", supplier_binding_version: 7 } } }];
  });
}
export function bindingFixtureService(backend) {
  let time = Date.now(); const writes = [];
  return { writes, from(table) {
    const filters = []; let patch = null, columns;
    const select = (r) => columns ? Object.fromEntries(columns.map((c) => [c, r[c]])) : r;
    async function execute(single = false, required = false) {
      const fn = (s) => {
        const field = (r, key) => key.startsWith("metadata->>") ? r.metadata?.[key.slice(11)] == null ? null : String(r.metadata[key.slice(11)]) : r[key];
        const matches = (s[table] ?? []).filter((r) => filters.every(([key, value]) => field(r, key) === value));
        if (patch) { for (const r of matches) Object.assign(r, structuredClone(patch), { updated_at: new Date(++time).toISOString() }); }
        const data = structuredClone(matches.map(select));
        return { data: single ? data[0] ?? null : data, error: required && data.length !== 1 ? { code: "PGRST116" } : null };
      };
      if (patch) { writes.push({ table, fields: Object.keys(patch) }); return backend.transact(fn); }
      return fn(await backend.read());
    }
    const q = { select(c) { columns = c.split(","); return q; }, eq(k, v) { filters.push([k, v]); return q; }, is(k, v) { filters.push([k, v]); return q; },
      update(p) { patch = p; return q; }, maybeSingle: () => execute(true), single: () => execute(true, true), then: (ok, fail) => execute().then(ok, fail) };
    return q;
  } };
}
export async function loadBindingRoutes(service, catalog) {
  const access = { current: { ok: true, user: { id: "mock-super-admin" } } }, stats = { clients: 0, audits: [] };
  async function load(name) {
    const source = await readFile(new URL(`../../app/api/admin/suppliers/${name}/bindings/[productId]/route.ts`, import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const deps = { crypto: await import("node:crypto"), "next/server": { NextResponse: { json: (b, o) => new Response(JSON.stringify(b), o) } },
      "@/lib/auth/require-admin": { getServerAdminContext: async () => access.current, getServerSuperAdminContext: async () => access.current },
      "@/lib/supabase/service-role": { getSupabaseServiceRoleClient: () => { stats.clients++; return service; } },
      "@/lib/admin/audit-log-service": { writeAdminAuditLog: async (a) => { stats.audits.push(a); return { ok: true }; } },
      "@/lib/providers/bitrefill/catalog-server": { getPersonalCatalogManager: () => catalog },
      "@/lib/providers/core/admin-sku-binding.mjs": await import("../../lib/providers/core/admin-sku-binding.mjs"),
      "@/lib/providers/daju/client": { createDajuClient: () => ({ getProduct: async (id) => { assert.equal(id, 15); return dajuDetail; } }) },
      "@/lib/providers/daju/errors": { getSafeDajuError: () => ({ code: "MOCK_DAJU_ERROR", status: 503 }) },
      "@/lib/providers/daju/mapper.mjs": mapper, "@/lib/providers/daju/stock.mjs": stock };
    const m = { exports: {} }; new Function("require", "module", "exports", compiled)((n) => { assert.ok(n in deps, n); return deps[n]; }, m, m.exports); return m.exports;
  }
  return { daju: await load("daju"), bitrefill: await load("bitrefill"), access, stats };
}
export async function bindingInput(catalog, sku, overrides = {}) {
  const detail = await catalog.detail("mock-apple-us");
  return { website_sku_id: sku.id, expected_updated_at: sku.updated_at, expected_binding_version: sku.metadata?.supplier_binding_version ?? 0,
    supplier_product_id: detail.product.id, catalog_fingerprint: detail.fingerprint, mode: "package", supplier_package_id: "mock-apple-us<&>5", range_value: null,
    sku_facts: { country: "US", currency: "USD", face_value: "5" }, configured_cost: null, cost_currency: null, configured_fees: null,
    review_status: "draft", review_note: "MOCK manual SKU review", ...overrides };
}
export async function runUnifiedBindingCases(backend) {
  await initializeBindingFixture(backend);
  const service = bindingFixtureService(backend), catalog = catalogFixture().catalog;
  const routes = await loadBindingRoutes(service, catalog); let checks = 0;
  const check = (v) => { assert.ok(v); checks++; };
  const post = async (provider, input) => {
    const url = `http://127.0.0.1/api/admin/suppliers/${provider}/bindings/mock-web-product`;
    const r = await routes[provider].POST(new Request(url, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1" }, body: JSON.stringify(input) }), { params: { productId: "mock-web-product" } });
    return { status: r.status, body: await r.json() };
  };
  routes.access.current = { ok: false, status: 401, message: "MOCK_LOGIN_REQUIRED" };
  check((await post("bitrefill", {})).status === 401 && routes.stats.clients === 0);
  routes.access.current = { ok: false, status: 403, message: "MOCK_SUPER_ADMIN_REQUIRED" };
  check((await post("bitrefill", {})).status === 403 && routes.stats.clients === 0);
  routes.access.current = { ok: true, user: { id: "mock-super-admin" } };
  const initial = await backend.read(), frozen = structuredClone(initial.frozenBindingOrders);
  let sku = initial.product_skus[0];
  const daju = await post("daju", { website_sku_id: sku.id, supplier_product_id: 15, supplier_sku: "13", supplier_max_unit_cost: "9", supplier_inputs_mapping: {}, expected_updated_at: sku.updated_at });
  check(daju.status === 200); sku = daju.body.sku;
  check(sku.metadata.supplier === "daju" && sku.stock === 50 && sku.delivery_type === "automatic" && sku.price === 20);
  check(sku.metadata.supplier_binding_version === 1 && sku.metadata.supplier_binding_audit.length === 1);
  const input = await bindingInput(catalog, sku);
  const saved = await post("bitrefill", input); check(saved.status === 200);
  check(saved.body.sku.metadata.supplier === "daju" && saved.body.activeBindingUnchanged && saved.body.sku.stock === 50);
  check(saved.body.candidate.supplier === "bitrefill" && saved.body.candidate.supplier_auto_purchase_enabled === false);
  check(!saved.body.candidate.supplier_cost_verified && !saved.body.candidate.required_parameters_verified);
  check(saved.body.candidate.supplier_cost === null && saved.body.financials.estimatedProfit === null);
  check(saved.body.sku.metadata.supplier_binding_version === 2 && saved.body.sku.metadata.supplier_binding_audit.length === 2);
  check((await post("bitrefill", input)).status === 409);
  sku = saved.body.sku;
  for (const change of [{ verified: true }, { automatic_purchase_enabled: true }, { supplier_package_id: "mock-missing" },
    { sku_facts: { country: "CA", currency: "USD", face_value: "5" } }, { sku_facts: { country: "US", currency: "USD", face_value: "10" } },
    { catalog_fingerprint: "0".repeat(64) }, { expected_binding_version: 0 }]) {
    check((await post("bitrefill", await bindingInput(catalog, sku, change))).status === 409);
  }
  const valid = await bindingInput(catalog, sku, { configured_cost: "10.10", cost_currency: "CNY", configured_fees: "0.20" });
  const concurrent = await Promise.all([post("bitrefill", valid), post("bitrefill", valid)]);
  check(concurrent.filter((r) => r.status === 200).length === 1 && concurrent.filter((r) => r.status === 409).length === 1);
  const priced = concurrent.find((r) => r.status === 200).body;
  check(priced.financials.estimatedProfit === "9.7" && !priced.financials.profitVerified);
  const second = (await backend.read()).product_skus[1];
  check((await post("bitrefill", await bindingInput(catalog, second))).status === 200);
  const reread = await backend.read();
  check(reread.product_skus[0].metadata.supplier_binding_version === 3 && reread.product_skus[1].metadata.supplier_binding_version === 1);
  check(reread.product_skus[0].metadata.supplier === "daju" && !reread.product_skus[1].metadata.supplier);
  assert.deepEqual(reread.frozenBindingOrders, frozen); checks++;
  for (const key of ["ledger", "balances", "privateDeliveries"]) { assert.deepEqual(reread[key], initial[key]); checks++; }
  check(service.writes.every((w) => ["product_skus", "products"].includes(w.table)));
  check(routes.stats.audits.some((a) => a.action === "bind_bitrefill_supplier_sku_candidate"));
  const back = await post("daju", { website_sku_id: priced.sku.id, supplier_product_id: 15, supplier_sku: "14", supplier_max_unit_cost: "10", supplier_inputs_mapping: {}, expected_updated_at: priced.sku.updated_at });
  check(back.status === 200 && back.body.sku.stock === 19 && back.body.sku.metadata.supplier === "daju");
  check(!back.body.sku.metadata.supplier_binding_candidate && back.body.sku.metadata.supplier_binding_audit.length === 4);
  return { checks, realPurchase: false, automaticRefund: false, frozenOrdersUnchanged: true, storage: "existing_product_skus_metadata" };
}
export { saveBitrefillSkuBinding };
