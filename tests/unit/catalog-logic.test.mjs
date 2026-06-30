import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStableCombinationKey,
  generateSkuCombinations,
  isProductDirty,
  normalizeProductPayload,
  sanitizeCsvCell,
} from "./helpers/catalog-logic.mjs";

test("normalizes valid product payload and trims text", () => {
  const result = normalizeProductPayload({
    name: "  ChatGPT Plus  ",
    slug: "chatgpt-plus",
    categoryId: "cat_1",
    price: "69.00",
    originalPrice: "99",
    stock: "10",
    imageUrl: "/images/product.png",
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.name, "ChatGPT Plus");
  assert.equal(result.value.price, 69);
  assert.equal(result.value.stock, 10);
});

test("rejects invalid product slug, missing category, negative price, and decimal stock", () => {
  const result = normalizeProductPayload({
    name: "商品",
    slug: "中文_slug",
    price: "-1",
    stock: "1.5",
    imageUrl: "not a url",
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.slug, /小写字母/);
  assert.match(result.errors.categoryId, /分类/);
  assert.match(result.errors.price, /售价/);
  assert.match(result.errors.stock, /库存/);
  assert.match(result.errors.imageUrl, /图片/);
});

test("detects product dirty state after normalization", () => {
  const original = { name: "A", slug: "a", category_id: "c1", price: "10.00", stock: 1 };
  const same = { name: " A ", slug: "a", categoryId: "c1", price: 10, stock: 1 };
  const changed = { ...same, stock: 2 };

  assert.equal(isProductDirty(original, same), false);
  assert.equal(isProductDirty(original, changed), true);
});

test("generates one, two, and three option group SKU combinations", () => {
  const combinations = generateSkuCombinations(
    [
      { name: "套餐", values: [{ id: "m1", value: "1个月" }, { id: "m3", value: "3个月" }] },
      { name: "地区", values: [{ id: "us", value: "美国" }, { id: "uk", value: "英国" }] },
      { name: "交付", values: [{ id: "mail", value: "邮箱" }] },
    ],
    [],
    { productSlug: "chatgpt-plus", price: 69, stock: 0 },
  );

  assert.equal(combinations.length, 4);
  assert.equal(combinations[0].title, "1个月 / 美国 / 邮箱");
  assert.equal(combinations[0].price, 69);
});

test("preserves existing SKU data when option values are reordered", () => {
  const existingKey = buildStableCombinationKey(["us", "m1"]);
  const existing = {
    id: "sku_1",
    optionValueIds: ["m1", "us"],
    combinationKey: existingKey,
    skuCode: "manual-code",
    price: 88,
    stock: 7,
    status: "active",
  };

  const combinations = generateSkuCombinations(
    [
      { name: "地区", values: [{ id: "us", value: "美国", sortOrder: 2 }] },
      { name: "套餐", values: [{ id: "m1", value: "1个月", sortOrder: 1 }] },
    ],
    [existing],
  );

  assert.equal(combinations.length, 1);
  assert.equal(combinations[0].id, "sku_1");
  assert.equal(combinations[0].skuCode, "manual-code");
  assert.equal(combinations[0].price, 88);
  assert.equal(combinations[0].stock, 7);
});

test("rejects duplicate option values in the same option group", () => {
  assert.throws(
    () =>
      generateSkuCombinations([
        { name: "套餐", values: [{ id: "a", value: "1个月" }, { id: "b", value: "1个月" }] },
      ]),
    /规格值重复/,
  );
});

test("protects CSV export cells from formula injection", () => {
  assert.equal(sanitizeCsvCell("=IMPORTXML(\"x\")"), "'=IMPORTXML(\"x\")");
  assert.equal(sanitizeCsvCell("+cmd"), "'+cmd");
  assert.equal(sanitizeCsvCell("normal"), "normal");
});
