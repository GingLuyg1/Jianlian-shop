import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";
import * as visibility from "../../lib/catalog/effective-category-visibility.mjs";
import * as summary from "../../lib/products/public-catalog-sku-summary.mjs";

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const primary = id(1), secondary = id(2), disabled = id(3), foreignPrimary = id(4), empty = id(5);
const categories = [
  { id: primary, level: 1, parent_id: null, is_active: true, name: "Public", slug: "public" },
  { id: secondary, level: 2, parent_id: primary, is_active: true, name: "Child", slug: "child" },
  { id: disabled, level: 2, parent_id: primary, is_active: false, name: "Disabled" },
  { id: foreignPrimary, level: 1, parent_id: null, is_active: true, name: "Other" },
  { id: empty, level: 2, parent_id: primary, is_active: true, name: "Empty" },
];
const product = (n, values = {}) => ({ id: id(100 + n), category_id: secondary, name: `Product ${n}`, slug: `product-${n}`, short_description: null,
  status: "active", price: 10 + n, original_price: null, stock: 3, has_skus: false, delivery_type: "automatic", sort_order: n,
  updated_at: "2026-10-30T01:00:00Z", ...values });
const products = [product(1, { has_skus: true }), product(2, { status: "sold_out" }), product(3, { stock: 8 }),
  product(4, { category_id: disabled }), product(5, { status: "draft" })];
const skus = [{ id: id(201), product_id: id(101), sku_code: "SKU-SEARCH", sku_title: "Searchable option", price: 7, original_price: 12, stock: 4, status: "active", delivery_type: "automatic" },
  { id: id(202), product_id: id(101), price: 15, stock: 99, status: "sold_out" }, { id: id(203), product_id: id(101), price: 1, stock: 99, status: "inactive" }];
const routePath = new URL("../../app/api/catalog/products/route.ts", import.meta.url);
function load({ defer = false, categoryError = false, productReject = false, rows = categories, source = fs.readFileSync(routePath, "utf8") } = {}) {
  const calls = [], gates = {}; const module = { exports: {} };
  const supabase = { from(table) {
    const filters = [], orders = []; let limit = Infinity;
    const builder = { select(columns) { assert.ok(!/metadata|supplier|secret|password|token/i.test(columns)); return builder; },
      in(column, values) { filters.push({ column, values }); return builder; }, order(column, options) { orders.push({ column, ascending: options.ascending }); return builder; },
      limit(value) { limit = value; return builder; }, then(resolve, reject) {
        calls.push(table);
        if (table === "products" && productReject) return Promise.reject(new Error("synthetic read failure")).then(resolve, reject);
        let data = table === "categories" ? rows : table === "products" ? products : skus;
        for (const filter of filters) data = data.filter(row => filter.values.includes(row[filter.column]));
        for (const { column, ascending } of [...orders].reverse()) data = [...data].sort((a, b) => String(a[column] ?? "").localeCompare(String(b[column] ?? ""), undefined, { numeric: true }) * (ascending ? 1 : -1));
        const result = { data: data.slice(0, limit), error: table === "categories" && categoryError ? new Error("category unavailable") : null };
        const promise = defer && table !== "product_skus" ? new Promise(done => { gates[table] = () => done(result); }) : Promise.resolve(result);
        return promise.then(resolve, reject);
      } };
    return builder;
  } };
  const dependencies = {
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/cache/cache-tags": { CACHE_REVALIDATE_SECONDS: { publicCatalog: 30 } },
    "@/lib/security/rate-limit": { checkRateLimit: () => ({ allowed: true }), getRequestSourceKey: () => "isolated" },
    "@/lib/supabase/server": { getSupabaseServerClient: () => supabase },
    "@/lib/catalog/effective-category-visibility.mjs": visibility,
    "@/lib/products/public-catalog-sku-summary.mjs": summary,
  };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", "console", code)(name => { assert.ok(name in dependencies, name); return dependencies[name]; }, module, module.exports, { error() {} });
  return { api: module.exports, calls, gates };
}
const request = (params = {}) => new Request("http://local/api/catalog/products?" + new URLSearchParams({ primaryCategoryId: primary, secondaryCategoryId: secondary, page: "1", pageSize: "20", ...params }));
const tick = () => new Promise(resolve => setImmediate(resolve));

test("secondary category validation and product read overlap, with no SKU read or response before validation", async () => {
  const { api, calls, gates } = load({ defer: true }); let responded = false;
  const operation = api.GET(request()).then(response => { responded = true; return response; }); await tick();
  assert.ok(calls.includes("categories") && calls.includes("products")); assert.ok(!calls.includes("product_skus"));
  gates.products(); await tick(); assert.equal(responded, false); assert.ok(!calls.includes("product_skus"));
  gates.categories(); const result = await (await operation).json();
  assert.equal(result.data.total, 3); assert.equal(calls.filter(table => table === "products").length, 1);
  assert.equal(result.data.products[0].min_price, 7); assert.equal(result.data.products[0].effective_stock, 4);
});

test("disabled categories and wrong parent never publish speculative rows or read SKU data", async () => {
  for (const params of [{ secondaryCategoryId: disabled }, { primaryCategoryId: foreignPrimary }]) {
    const { api, calls, gates } = load({ defer: true }); const operation = api.GET(request(params)); await tick();
    gates.products(); gates.categories(); const response = await operation, body = await response.json();
    assert.equal(response.status, 404); assert.equal(body.error.code, "CATEGORY_NOT_FOUND"); assert.equal(body.data, undefined); assert.ok(!calls.includes("product_skus"));
  }
  const inactiveParent = categories.map(row => row.id === primary ? { ...row, is_active: false } : row);
  const { api, calls } = load({ rows: inactiveParent }); assert.equal((await api.GET(request())).status, 404); assert.ok(!calls.includes("product_skus"));
});

test("speculative product failure preserves category errors and normal read failures", async () => {
  const hidden = load({ productReject: true }); assert.equal((await hidden.api.GET(request({ secondaryCategoryId: disabled }))).status, 404);
  const failed = load({ productReject: true }); assert.equal((await failed.api.GET(request())).status, 500);
  const categoryFailed = load({ categoryError: true }); assert.equal((await categoryFailed.api.GET(request())).status, 500);
});

test("invalid IDs never start reads, and primary-only requests wait for a validated descendant filter", async () => {
  const invalid = load(); assert.equal((await invalid.api.GET(request({ secondaryCategoryId: "bad" }))).status, 400); assert.equal(invalid.calls.length, 0);
  const { api, calls, gates } = load({ defer: true }); const operation = api.GET(request({ secondaryCategoryId: "" })); await tick();
  assert.deepEqual(calls, ["categories"]); gates.categories(); await tick(); assert.deepEqual(calls, ["categories", "products"]); gates.products();
  assert.equal((await operation).status, 200);
});

test("parallel results preserve SKU search, paging, stock sorting, zero results and public cache headers", async () => {
  const scenarios = [
    [{}, 3], [{ keyword: "SKU-SEARCH" }, 1], [{ pageSize: "1", page: "2" }, 3],
    [{ excludeId: id(101) }, 2], [{ keyword: "not-present" }, 0], [{ secondaryCategoryId: empty }, 0],
  ];
  for (const [params, total] of scenarios) {
    const { api } = load(); const response = await api.GET(request(params)), body = await response.json();
    assert.equal(response.status, 200); assert.equal(body.data.total, total); assert.equal(response.headers.get("cache-control"), "public, max-age=30, stale-while-revalidate=30");
    assert.ok(body.data.products.every(row => row.category_id === secondary));
    assert.ok(body.data.products.every(row => !["draft", "inactive"].includes(row.status)));
    if (!Object.keys(params).length) {
      assert.deepEqual(body.data.products.map(row => row.id), [id(101), id(103), id(102)]);
      assert.equal(body.data.products.at(-1).effective_stock, 0);
    }
  }
});
