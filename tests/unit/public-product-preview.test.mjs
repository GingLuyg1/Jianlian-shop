import assert from "node:assert/strict";
import test from "node:test";
import { loadPureTypeScript } from "../helpers/load-pure-typescript.mjs";
const { rememberPublicProductPreview, peekPublicProductPreview, clearPublicProductPreviews } = loadPureTypeScript(new URL("../../lib/catalog/public-product-preview.ts", import.meta.url));

test("listing previews are short lived and match the exact product identity", () => {
  clearPublicProductPreviews();
  rememberPublicProductPreview({ id: "a", slug: "product-a", name: "A", price: 12, stock: 1 }, 1000);
  rememberPublicProductPreview({ id: "b", slug: "product-b", name: "B", price: 99, stock: 2 }, 1100);
  assert.equal(peekPublicProductPreview("product-a", 2000)?.price, 12);
  assert.equal(peekPublicProductPreview("b", 2000)?.price, 99);
  assert.equal(peekPublicProductPreview("unknown", 2000), null);
  assert.equal(peekPublicProductPreview("a", 16000), null);
});

test("previews omit arbitrary metadata, long detail bodies and private fields", () => {
  clearPublicProductPreviews();
  rememberPublicProductPreview({ id: "a", slug: "product-a", name: "A", description: "long detail", metadata: { private: "not retained" }, supplier_secret: "not retained" }, 1000);
  const row = peekPublicProductPreview("a", 1001);
  assert.equal(row.description, null);
  assert.equal(row.metadata, null);
  assert.equal("supplier_secret" in row, false);
  clearPublicProductPreviews();
  assert.equal(peekPublicProductPreview("product-a", 1002), null);
});
