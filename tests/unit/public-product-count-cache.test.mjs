import assert from "node:assert/strict";
import test from "node:test";

import { loadPureTypeScript } from "../helpers/load-pure-typescript.mjs";
const { clearPublicProductCounts, forgetPublicProductCount, getPublicProductCount, getPublicProductCountForRoute, rememberPublicProductCount, retainVisiblePublicProductCounts } = loadPureTypeScript(new URL("../../lib/catalog/public-product-count-cache.ts", import.meta.url));

test("public placeholder count belongs only to the exact query and route", () => {
  clearPublicProductCounts();
  rememberPublicProductCount("category-a|search=|page=1", "/products/a", "a", 2, 1000);
  assert.equal(getPublicProductCount("category-a|search=|page=1", 1001), 2);
  assert.equal(getPublicProductCountForRoute("/products/a", 1001), 2);
  assert.equal(getPublicProductCount("category-a|search=x|page=1", 1001), undefined);
  assert.equal(getPublicProductCountForRoute("/products/b", 1001), undefined);
  assert.equal(getPublicProductCount("category-a|search=|page=1", 31001), undefined);
});

test("disabled categories and failed requests invalidate count hints", () => {
  clearPublicProductCounts();
  rememberPublicProductCount("a", "/products/a", "a", 2, 1000);
  rememberPublicProductCount("b", "/products/b", "b", 1, 1000);
  retainVisiblePublicProductCounts(new Set(["a"]));
  assert.equal(getPublicProductCountForRoute("/products/a", 1001), 2);
  assert.equal(getPublicProductCountForRoute("/products/b", 1001), undefined);
  forgetPublicProductCount("a");
  assert.equal(getPublicProductCountForRoute("/products/a", 1001), undefined);
});
