import assert from "node:assert/strict";
import test from "node:test";
import { deriveSkuProductSummary, ensureTrailingEmptySkuRow, isSkuDraftEmpty, validateSkuDraft } from "../../lib/products/sku-editor.mjs";

const blank = () => ({ sku_title: "", sku_code: "", price: "", stock: "", original_price: "", image_url: "", sort_order: "0", status: "active", delivery_type: "" });
const filled = (code = "A") => ({ ...blank(), sku_title: "规格", sku_code: code, price: "12", stock: "18" });
const makeRow = () => ({ key: "blank", draft: blank() });

test("visual status and delivery defaults do not persist an empty SKU row", () => {
  assert.equal(isSkuDraftEmpty(blank()), true);
  assert.equal(isSkuDraftEmpty({ ...blank(), touched: true }), true);
  assert.equal(isSkuDraftEmpty({ ...blank(), stock: "0" }), false);
  assert.equal(isSkuDraftEmpty({ ...blank(), touched: true, status: "inactive" }), false);
});
test("one filled SKU and a trailing blank persist exactly one SKU", () => {
  const rows = ensureTrailingEmptySkuRow([{ key: "A", draft: filled() }], makeRow);
  assert.equal(rows.length, 2);
  assert.equal(rows.filter((row) => !isSkuDraftEmpty(row.draft)).length, 1);
});
test("editing trailing row adds the next blank, clearing it leaves only one blank", () => {
  const rows = ensureTrailingEmptySkuRow([{ key: "A", draft: filled() }, { key: "B", draft: filled("B") }], makeRow);
  assert.equal(rows.length, 3);
  assert.equal(rows.filter((row) => !isSkuDraftEmpty(row.draft)).length, 2);
  const cleared = ensureTrailingEmptySkuRow([{ key: "A", draft: filled() }, { key: "B", draft: { ...blank(), touched: true } }, makeRow()], makeRow);
  assert.equal(cleared.length, 2);
  const persisted = ensureTrailingEmptySkuRow([{ key: "existing", sku: { id: "existing" }, draft: blank() }], makeRow);
  assert.equal(persisted.length, 2);
});
test("partial rows produce per-field errors; zero price and stock are valid explicit values", () => {
  assert.deepEqual(Object.keys(validateSkuDraft({ ...blank(), sku_title: "半填" })).sort(), ["price", "sku_code", "stock"]);
  assert.deepEqual(validateSkuDraft({ ...filled(), price: "0", stock: "0" }), {});
  assert.ok(validateSkuDraft({ ...filled(), stock: "1.5" }).stock);
  assert.ok(validateSkuDraft({ ...filled(), original_price: "bad" }).original_price);
});
test("single SKU and multiple active SKUs derive summary without inactive stock or price", () => {
  assert.deepEqual(deriveSkuProductSummary([filled()]), { price: 12, stock: 18, has_skus: true });
  assert.deepEqual(deriveSkuProductSummary([filled(), { ...filled("B"), price: "9", stock: "4" }, { ...filled("C"), status: "inactive", price: "1", stock: "99" }]), { price: 9, stock: 22, has_skus: true });
  assert.deepEqual(deriveSkuProductSummary([{ ...filled(), status: "inactive" }]), { price: null, stock: 0, has_skus: true });
  assert.equal(deriveSkuProductSummary([{ ...filled(), price: "" }]).price, null);
});
