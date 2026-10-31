import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";
import * as visibility from "../../lib/catalog/effective-category-visibility.mjs";

const compile = path => ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function client({ saveData = false, visible = true } = {}) {
  const calls = []; let now = 1000; const module = { exports: {} };
  new Function("module", "exports", "fetch", "document", "navigator", "Date", compile("../../lib/catalog/public-product-count-cache.ts"))(
    module, module.exports, () => new Promise(resolve => calls.push(resolve)), { visibilityState: visible ? "visible" : "hidden" },
    { connection: { saveData } }, { now: () => now });
  return { api: module.exports, calls, advance: ms => { now += ms; } };
}
const key = (id = "a", search = "", page = 1, size = 20) => JSON.stringify(["sim-cards", id, search, page, size]);
const payload = (total = 23) => Response.json({ complete: true, counts: [{ primaryCategoryId: "p", secondaryCategoryId: "a", total }] });

test("one bulk count request serves all page sizes, while search remains unknown", async () => {
  const { api, calls, advance } = client();
  const a = api.prefetchPublicProductCounts(), b = api.prefetchPublicProductCounts();
  assert.equal(a, b); assert.equal(calls.length, 1);
  calls[0](payload()); await a;
  assert.equal(api.getPublicProductCount(key()), 20);
  assert.equal(api.getPublicProductCount(key("a", "", 2)), 3);
  assert.equal(api.getPublicProductCount(key("a", "", 999)), 3);
  assert.equal(api.getPublicProductCount(key("a", "", 2, 10)), 10);
  assert.equal(api.getPublicProductCount(key("a", "search")), undefined);
  assert.equal(api.getPublicProductCount(key("b")), undefined);
  await api.prefetchPublicProductCounts(); assert.equal(calls.length, 1);
  advance(30001); assert.equal(api.getPublicProductCount(key()), undefined);
});

test("actual query counts supersede speculative totals and failed queries discard hints", async () => {
  const { api, calls } = client(); const prefetch = api.prefetchPublicProductCounts(); calls[0](payload()); await prefetch;
  api.rememberPublicProductCount(key(), "/products/sim-cards", "a", 2, 1000);
  assert.equal(api.getPublicProductCount(key()), 2);
  api.forgetPublicProductCount(key()); assert.equal(api.getPublicProductCount(key()), undefined);
});

test("failed, incomplete and malformed responses never become zero-count hints", async () => {
  for (const response of [new Response(null, { status: 503 }), Response.json({ complete: false, counts: [] }), Response.json({ complete: true, counts: [{ secondaryCategoryId: "a", total: -1 }] })]) {
    const { api, calls } = client(); const prefetch = api.prefetchPublicProductCounts(); calls[0](response);
    assert.equal(await prefetch, false); assert.equal(api.getPublicProductCount(key()), undefined);
  }
});

test("invalidated, invisible or save-data preload cannot publish stale data", async () => {
  for (const options of [{ saveData: true }, { visible: false }]) {
    const { api, calls } = client(options); assert.equal(await api.prefetchPublicProductCounts(), false); assert.equal(calls.length, 0);
  }
  const { api, calls } = client(); const request = api.prefetchPublicProductCounts(); api.clearPublicProductCounts(); calls[0](payload());
  assert.equal(await request, false); assert.equal(api.getPublicProductCount(key()), undefined);
});

function server({ products = [], categories, fail = false, limited = false } = {}) {
  const reads = []; const module = { exports: {} };
  const data = categories ?? [{ id: "p", parent_id: null, level: 1, is_active: true }, { id: "a", parent_id: "p", level: 2, is_active: true },
    { id: "empty", parent_id: "p", level: 2, is_active: true }, { id: "off", parent_id: "p", level: 2, is_active: false }];
  const supabase = { from(table) {
    assert.ok(["categories", "products"].includes(table)); const read = { table }; reads.push(read);
    const builder = { select(columns) { read.columns = columns; return builder; }, in(column, values) { read.filter = { column, values }; return builder; },
      order(column) { read.order = column; return builder; }, range(from, to) { read.from = from; read.to = to; return builder; }, limit() { return builder; },
      then(resolve, reject) { return Promise.resolve({ data: table === "categories" ? data : products.slice(read.from, read.to + 1), error: fail ? { message: "fixture failure" } : null }).then(resolve, reject); } };
    return builder;
  } };
  const require = id => id === "next/server" ? { NextResponse: { json: Response.json } } : id.endsWith("/supabase/server") ? { getSupabaseServerClient: () => supabase } :
    id.endsWith("/security/rate-limit") ? { getRequestSourceKey: () => "isolated", checkRateLimit: () => limited ? { allowed: false, response: new Response(null, { status: 429 }) } : { allowed: true } } : visibility;
  new Function("require", "module", "exports", compile("../../app/api/catalog/product-counts/route.ts"))(require, module, module.exports);
  return { api: module.exports, reads };
}

test("public bulk counts include true zeroes and omit disabled categories without reading SKUs", async () => {
  const { api, reads } = server({ products: [{ id: "1", category_id: "a" }, { id: "2", category_id: "a" }, { id: "3", category_id: "off" }] });
  const response = await api.GET(new Request("http://local/api/catalog/product-counts")); const result = await response.json();
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(result, { complete: true, counts: [{ primaryCategoryId: "p", secondaryCategoryId: "a", total: 2 }, { primaryCategoryId: "p", secondaryCategoryId: "empty", total: 0 }] });
  assert.equal(reads.find(x => x.table === "products").columns, "id,category_id");
  assert.deepEqual(reads.find(x => x.table === "products").filter, { column: "status", values: ["active", "sold_out"] });
});

test("bulk pagination does not silently truncate counts at the first database page", async () => {
  const { api, reads } = server({ products: Array.from({ length: 1201 }, (_, i) => ({ id: String(i), category_id: "a" })) });
  const result = await (await api.GET(new Request("http://local"))).json();
  assert.equal(result.complete, true); assert.equal(result.counts[0].total, 1000); // existing listing ceiling
  assert.deepEqual(reads.filter(x => x.table === "products").map(x => x.from), [0, 500, 1000]);
});

test("budget exhaustion and truncated categories return unknown rather than false zeroes", async () => {
  const { api, reads } = server({ products: Array.from({ length: 10000 }, (_, i) => ({ id: String(i), category_id: "a" })) });
  assert.deepEqual(await (await api.GET(new Request("http://local"))).json(), { complete: false, counts: [] });
  assert.equal(reads.filter(x => x.table === "products").length, 20);
  const truncated = server({ categories: Array.from({ length: 1000 }, (_, i) => ({ id: String(i), level: 1, is_active: true })) });
  assert.equal((await (await truncated.api.GET(new Request("http://local"))).json()).complete, false);
});

test("count errors and rate limit preserve real failure states", async () => {
  const failed = server({ fail: true }); assert.equal((await failed.api.GET(new Request("http://local"))).status, 503);
  const limited = server({ limited: true }); assert.equal((await limited.api.GET(new Request("http://local"))).status, 429); assert.equal(limited.reads.length, 0);
});
