import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";
import * as visibility from "../../lib/catalog/effective-category-visibility.mjs";
const recordModule = { exports: {} };
new Function("module", "exports", ts.transpileModule(fs.readFileSync(new URL("../../lib/account/record-preload.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(recordModule, recordModule.exports);
const { createAccountRecordPreload } = recordModule.exports;

const namedOrder = (id = "order-a", name = "完整的商品名称") => ({ id, order_no: `NO-${id}`, order_items: [{ product_name: name }] });
test("balance product names reuse validated order-list names without an extra orders request", async () => {
  let calls = 0; const cache = createAccountRecordPreload(async () => { calls++; throw Error("unexpected fetch"); }); cache.setUser("user-a");
  cache.rememberOrderProductNames([namedOrder()]);
  assert.deepEqual(await cache.loadOrderProductNames(["order-a", "NO-order-a"]), { "order-a": "完整的商品名称", "NO-order-a": "完整的商品名称" });
  assert.equal(calls, 0);
});

test("balance name lookup is deduped, short-lived and stores only requested name results", async () => {
  let calls = 0, time = 1000, resolve; const cache = createAccountRecordPreload(() => { calls++; return new Promise(done => { resolve = done; }); }, () => time); cache.setUser("user-a");
  const a = cache.loadOrderProductNames(["order-a"]), b = cache.loadOrderProductNames(["NO-order-a"]);
  await Promise.resolve(); assert.equal(calls, 1); resolve(Response.json({ orders: [namedOrder()] }));
  assert.deepEqual(await a, { "order-a": "完整的商品名称" }); assert.deepEqual(await b, { "NO-order-a": "完整的商品名称" });
  assert.deepEqual(await cache.loadOrderProductNames(["unknown-older-order"]), {}); assert.equal(calls, 1);
  time += 15001; const expired = cache.loadOrderProductNames(["order-a"]); await Promise.resolve(); assert.equal(calls, 2); resolve(Response.json({ orders: [namedOrder("order-a", "更新的名称")] })); assert.deepEqual(await expired, { "order-a": "更新的名称" });
});

test("sign-out aborts private name lookup and an old user cannot populate the next user's names", async () => {
  let resolve, signal; const cache = createAccountRecordPreload((_url, options) => { signal = options.signal; return new Promise(done => { resolve = done; }); }); cache.setUser("user-a");
  const pending = cache.loadOrderProductNames(["order-a"]); const rejected = assert.rejects(pending, /已过期/); await Promise.resolve(); cache.setUser("user-b"); assert.equal(signal.aborted, true);
  resolve(Response.json({ orders: [namedOrder()] })); await rejected;
  cache.setUser(null); await assert.rejects(cache.loadOrderProductNames(["order-a"]), /登录/);
});

test("failed order-name reads remain retryable and do not create fake empty success", async () => {
  let calls = 0; const cache = createAccountRecordPreload(async () => { calls++; return calls === 1 ? new Response(null, { status: 503 }) : Response.json({ orders: [namedOrder()] }); }); cache.setUser("user-a");
  await assert.rejects(cache.loadOrderProductNames(["order-a"])); assert.deepEqual(await cache.loadOrderProductNames(["order-a"]), { "order-a": "完整的商品名称" }); assert.equal(calls, 2);
});

test("private name failures at 401 clear all identity-scoped records", async () => {
  const cache = createAccountRecordPreload(async () => new Response(null, { status: 401 })); cache.setUser("user-a"); cache.rememberOrderProductNames([namedOrder()]);
  await assert.rejects(cache.loadOrderProductNames(["unknown"])); assert.equal(cache.getSnapshot().status, "anonymous"); assert.equal(cache.peek("balance", 1), null);
});

function publicDetail(fetcher) {
  const module = { exports: {} }; const source = fs.readFileSync(new URL("../../lib/supabase/public-catalog.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", "fetch", code)(name => name.endsWith("effective-category-visibility.mjs") ? visibility : { getSupabaseBrowserClient() { throw Error("unexpected direct read"); } }, module, module.exports, fetcher);
  return module.exports;
}
test("simultaneous product details share one read, while every settled revisit revalidates stock", async () => {
  let calls = 0, resolve; const api = publicDetail(() => { calls++; return new Promise(done => { resolve = done; }); });
  const a = api.getPublicProductDetail("product-a"), b = api.getPublicProductDetail("product-a"); assert.equal(a, b); assert.equal(calls, 1);
  resolve(Response.json({ success: true, data: { product: { id: "product-a", stock: 4 }, skus: [] } })); assert.equal((await a).product.stock, 4); await b;
  const fresh = api.getPublicProductDetail("product-a"); assert.equal(calls, 2); resolve(Response.json({ success: true, data: { product: { id: "product-a", stock: 0 }, skus: [] } })); assert.equal((await fresh).product.stock, 0);
});

test("product detail errors do not poison retries or merge different products", async () => {
  let calls = 0; const api = publicDetail(async url => { calls++; return calls === 1 ? new Response(null, { status: 503 }) : Response.json({ success: true, data: { product: { id: url.split("/").at(-1) }, skus: [] } }); });
  await assert.rejects(api.getPublicProductDetail("a")); assert.equal((await api.getPublicProductDetail("a")).product.id, "a"); const [a, b] = await Promise.all([api.getPublicProductDetail("a"), api.getPublicProductDetail("b")]); assert.equal(a.product.id, "a"); assert.equal(b.product.id, "b"); assert.equal(calls, 4);
});

test("UUID detail fallback cannot wait forever on its own in-flight request", async () => {
  const id = "11111111-1111-4111-8111-111111111111"; let calls = 0;
  const api = publicDetail(async url => { calls++; return url.includes("?") ? Response.json({ success: true, data: { products: [{ id, slug: id }] } }) : new Response(null, { status: 404 }); });
  await assert.rejects(api.getPublicProductDetail(id), /暂时无法读取/); assert.equal(calls, 2);
});
