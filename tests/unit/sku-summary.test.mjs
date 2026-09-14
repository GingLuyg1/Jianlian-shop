import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import test from "node:test";
import { deriveSkuProductSummary } from "../../lib/products/sku-editor.mjs";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = fs.readFileSync(new URL("../../lib/products/sku-summary.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports, require: (name) => name === "server-only" ? {} : { deriveSkuProductSummary } });
const sync = exports.syncSkuProductSummary;

function service(pages, { readError = false, writeError = false } = {}) {
  const writes = [], ranges = [];
  return { writes, ranges, from(table) {
    if (table === "products") return { update(payload) { writes.push(payload); return { eq: async () => ({ error: writeError ? {} : null }) }; } };
    return { select() { return this; }, eq() { return this; }, order() { return this; }, async range(start, end) { ranges.push([start, end]); return { data: pages[Math.floor(start / 500)] ?? [], error: readError ? {} : null }; } };
  } };
}
test("SKU summary paginates beyond PostgREST cap and writes exact active min price and stock", async () => {
  const client = service([Array.from({ length: 500 }, () => ({ status: "active", price: 12, stock: 1 })), [{ status: "active", price: 9, stock: 18 }, { status: "inactive", price: 1, stock: 99 }]]);
  await sync(client, "product");
  assert.deepEqual(client.ranges, [[0, 499], [500, 999]]);
  assert.equal(client.writes[0].price, 9);
  assert.equal(client.writes[0].stock, 518);
  assert.equal(client.writes[0].has_skus, true);
});
test("SKU summary read errors fail closed without writing a zero summary", async () => {
  const client = service([], { readError: true });
  await assert.rejects(sync(client, "product"), /汇总读取失败/);
  assert.equal(client.writes.length, 0);
});
test("SKU summary write errors surface and no-active summary retains last price", async () => {
  const client = service([[{ status: "inactive", price: 12, stock: 18 }]], { writeError: true });
  await assert.rejects(sync(client, "product"), /汇总失败/);
  assert.equal(client.writes[0].stock, 0);
  assert.equal(Object.hasOwn(client.writes[0], "price"), false);
});
