import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";

function harness({ saveData = false, visibility = "visible", effectiveType = "4g" } = {}) {
  const calls = [];
  let now = 1000;
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(new URL("../../lib/catalog/public-product-query-cache.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mockRequire = (id) => {
    if (id.endsWith("public-catalog")) return { searchPublicCatalogProducts: query => new Promise((resolve, reject) => calls.push({ query, resolve, reject })) };
    if (id.endsWith("public-product-preview")) return { rememberPublicProductPreview() {}, clearPublicProductPreviews() {} };
    if (id.endsWith("public-product-count-cache")) return { rememberPublicProductCount() {} };
    if (id.endsWith("visible-storefront-category-routes")) return {};
    throw new Error(`Unexpected dependency: ${id}`);
  };
  new Function("require", "module", "exports", "document", "navigator", "Date", code)(mockRequire, module, module.exports,
    { visibilityState: visibility }, { connection: { saveData, effectiveType } }, { now: () => now });
  return { api: module.exports, calls, advance: ms => { now += ms; } };
}
const query = { primaryCategoryId: "primary-a", secondaryCategoryId: "secondary-a", keyword: "", page: 1, pageSize: 20 };
const result = { products: [], total: 0, page: 1, pageSize: 20, totalPages: 0, deliveryTypes: [] };

test("secondary hover, click and warm return share one request until public TTL expires", async () => {
  const { api, calls, advance } = harness();
  const hover = api.prefetchPublicProductPage(query);
  const click = api.getPublicProductPage(query);
  assert.equal(calls.length, 1);
  calls[0].resolve(result);
  assert.equal(await hover, true);
  assert.equal(await click, result);
  assert.equal(await api.getPublicProductPage(query), result);
  assert.equal(calls.length, 1);
  advance(15001);
  const expired = api.getPublicProductPage(query);
  assert.equal(calls.length, 2);
  calls[1].resolve(result);
  await expired;
});

test("background budget limits speculative traffic without blocking foreground selection", async () => {
  const { api, calls } = harness();
  const a = api.prefetchPublicProductPage(query);
  const b = api.prefetchPublicProductPage({ ...query, secondaryCategoryId: "b" });
  assert.equal(await api.prefetchPublicProductPage({ ...query, secondaryCategoryId: "c" }), false);
  const foreground = api.getPublicProductPage({ ...query, secondaryCategoryId: "c" });
  assert.equal(calls.length, 3);
  calls.forEach(call => call.resolve(result));
  await Promise.all([a, b, foreground]);
});

test("save-data, slow network and hidden page suppress optional prefetch", async () => {
  for (const options of [{ saveData: true }, { effectiveType: "2g" }, { visibility: "hidden" }]) {
    const { api, calls } = harness(options);
    assert.equal(await api.prefetchPublicProductPage(query), false);
    assert.equal(calls.length, 0);
  }
});

test("failed prefetch cannot poison a later explicit query", async () => {
  const { api, calls } = harness();
  const failed = api.prefetchPublicProductPage(query);
  calls[0].reject(new Error("offline"));
  assert.equal(await failed, false);
  assert.equal(api.peekPublicProductPage(query), undefined);
  const retry = api.getPublicProductPage(query);
  assert.equal(calls.length, 2);
  calls[1].resolve(result);
  assert.equal(await retry, result);
});

test("every listing filter has its own cache identity", () => {
  const { api } = harness();
  const variants = [query, { ...query, primaryCategoryId: "other" }, { ...query, secondaryCategoryId: "other" },
    { ...query, keyword: "search" }, { ...query, page: 2 }, { ...query, pageSize: 10 }, { ...query, excludeId: "excluded" }];
  assert.equal(new Set(variants.map(api.publicProductQueryKey)).size, variants.length);
});
