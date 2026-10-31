import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import * as visibility from "../../lib/catalog/effective-category-visibility.mjs";

const productId = "11111111-1111-4111-8111-111111111111";
const product = { id: productId, category_id: "child", slug: "public-product", name: "Public product", status: "active", stock: 4 };
const sourcePath = new URL("../../app/api/catalog/products/[identifier]/route.ts", import.meta.url);
function harness({ deferred = false, categoryError = false, disabled = false, missing = false, productError = false, skuError = null, source = fs.readFileSync(sourcePath, "utf8") } = {}) {
  const calls = [], gates = {}; const module = { exports: {} };
  const wait = (key, data) => deferred ? new Promise(resolve => { gates[key] = () => resolve(data); }) : Promise.resolve(data);
  const client = { from(table) {
    const builder = { select(columns) { assert.ok(!/metadata|supplier|secret|token/i.test(columns)); return builder; }, eq() { return builder; }, in() { return builder; }, order() { return builder; }, limit() { return builder; },
      maybeSingle() { calls.push("product"); return wait("product", { data: missing ? null : product, error: productError ? { message: "product unavailable" } : null }); },
      then(resolve, reject) {
        calls.push(table);
        if (table === "categories") return wait("category", { data: [{ id: "root", parent_id: null, is_active: !disabled }, { id: "child", parent_id: "root", is_active: true }], error: categoryError ? { message: "category unavailable" } : null }).then(resolve, reject);
        assert.equal(table, "product_skus"); return Promise.resolve({ data: [{ id: "sku", stock: 3, status: "active" }], error: skuError }).then(resolve, reject);
      } }; return builder;
  } };
  const deps = { crypto: { randomUUID: () => "isolated-request" }, "next/server": { NextResponse: { json: Response.json } },
    "@/lib/supabase/public-catalog": { normalizePublicProduct: row => row, normalizePublicSku: row => row },
    "@/lib/supabase/service-role": { getSupabaseServiceRoleClient: () => null },
    "@/lib/supabase/server": { getSupabaseServerClient: () => client },
    "@/lib/catalog/effective-category-visibility.mjs": visibility };
  new Function("require", "module", "exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => { assert.ok(name in deps, name); return deps[name]; }, module, module.exports);
  return { api: module.exports, calls, gates };
}
const read = (api, identifier = "public-product") => api.GET(new Request("http://local/api/catalog/products/" + identifier), { params: { identifier } });
const tick = () => new Promise(resolve => setImmediate(resolve));

test("product detail starts category and product reads together but withholds SKUs and response until visibility validation", async () => {
  const { api, calls, gates } = harness({ deferred: true }); let responded = false;
  const operation = read(api).then(value => { responded = true; return value; }); await tick();
  assert.ok(calls.includes("product") && calls.includes("categories")); gates.product(); await tick();
  assert.equal(responded, false); assert.ok(!calls.includes("product_skus")); gates.category();
  const response = await operation; assert.equal(response.status, 200); assert.equal((await response.json()).data.skus[0].stock, 3);
});
test("detail concurrency preserves hidden-parent rejection and avoids SKU access", async () => {
  const { api, calls } = harness({ disabled: true }); const response = await read(api);
  assert.equal(response.status, 404); assert.ok(!calls.includes("product_skus")); assert.equal((await response.json()).error.code, "PRODUCT_NOT_FOUND");
});
test("detail category errors do not override a missing product's original 404", async () => {
  const missing = harness({ missing: true, categoryError: true }); assert.equal((await read(missing.api)).status, 404);
  const found = harness({ categoryError: true }); assert.equal((await read(found.api)).status, 500);
  assert.ok(!found.calls.includes("product_skus"));
});
test("detail error and optional SKU contracts stay unchanged", async () => {
  const failed = harness({ productError: true }); assert.equal((await read(failed.api)).status, 500);
  const optional = harness({ skuError: { message: "product_skus does not exist" } }); const response = await read(optional.api);
  assert.equal(response.status, 200); const body = await response.json(); assert.deepEqual(body.data.skus, []); assert.equal(body.data.sku_error, null);
});
test("invalid detail identifiers do not start data reads", async () => {
  const { api, calls } = harness(); assert.equal((await read(api, "")).status, 400); assert.equal(calls.length, 0);
});
