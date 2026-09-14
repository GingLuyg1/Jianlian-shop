import assert from "node:assert/strict";
import test from "node:test";

import { buildSupplierStockSnapshotUpdate, listDajuSkuStockOptions, resolveDajuEffectiveStock } from "../../lib/providers/daju/stock.mjs";

const detail = {
  id: 15, title: "Product", price: "8", stock: 27, sales: 0, isAuto: true,
  isSku: true, minQty: 1, maxQty: 10, requiredInputs: [], specs: [],
  skuVariants: [
    { id: 13, title: "新号（已养号1月以上）", price: "8", stock: 18 },
    { id: 14, title: "老号（注册时间5年以上）", price: "9.5", stock: 9 },
  ],
};

test("supplier SKU stock resolves exact variant instead of product total", () => {
  assert.equal(resolveDajuEffectiveStock(detail, "13").stock, 18);
  assert.equal(resolveDajuEffectiveStock(detail, "14").stock, 9);
  assert.notEqual(resolveDajuEffectiveStock(detail, "14").stock, 27);
  assert.deepEqual(listDajuSkuStockOptions(detail).map(({ sku, stock }) => ({ sku, stock })), [{ sku: "13", stock: 18 }, { sku: "14", stock: 9 }]);
});

test("SKU product without a matching supplier SKU never falls back to total stock", () => {
  assert.deepEqual(resolveDajuEffectiveStock(detail, null), { ok: false, code: "SUPPLIER_SKU_REQUIRED" });
  assert.deepEqual(resolveDajuEffectiveStock(detail, "missing"), { ok: false, code: "SUPPLIER_SKU_NOT_FOUND" });
});

test("provider failure retains last successful stock snapshot", () => {
  const before = { supplier_stock_snapshot: 18, supplier_stock_last_success_at: "2026-09-14T00:00:00.000Z" };
  const update = buildSupplierStockSnapshotUpdate(18, before, { ok: false, code: "SUPPLIER_READ_FAILED" }, "2026-09-15T00:00:00.000Z");
  assert.equal(update.stock, 18);
  assert.equal(update.metadata.supplier_stock_snapshot, 18);
  assert.equal(update.metadata.supplier_stock_last_success_at, before.supplier_stock_last_success_at);
  assert.equal(update.metadata.supplier_stock_sync_status, "error");
});

test("non-SKU supplier product uses authoritative detail stock", () => {
  assert.deepEqual(resolveDajuEffectiveStock({ ...detail, isSku: false, stock: 6 }, null), { ok: true, stock: 6, source: "product" });
});
