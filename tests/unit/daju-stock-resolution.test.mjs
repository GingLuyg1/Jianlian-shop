import assert from "node:assert/strict";
import test from "node:test";

import { buildSupplierStockAggregateUpdate, buildSupplierStockSnapshotUpdate, collectDajuBoundProductIds, listDajuSkuStockOptions, resolveDajuEffectiveStock, resolveDajuSkuStockBinding, sumActiveSupplierSkuStock } from "../../lib/providers/daju/stock.mjs";

const detail = {
  id: 15, title: "Product", price: "8", stock: 69, sales: 0, isAuto: true,
  isSku: true, minQty: 1, maxQty: 10, requiredInputs: [], specs: [],
  skuVariants: [
    { id: 13, title: "新号（已养号1月以上）", price: "8", stock: 50 },
    { id: 14, title: "老号（注册时间2年以上）", price: "9.5", stock: 19 },
  ],
};

test("supplier SKU stock resolves exact variant instead of product total", () => {
  assert.equal(resolveDajuEffectiveStock(detail, "13").stock, 50);
  assert.equal(resolveDajuEffectiveStock(detail, "14").stock, 19);
  assert.notEqual(resolveDajuEffectiveStock(detail, "14").stock, 69);
  assert.deepEqual(listDajuSkuStockOptions(detail).map(({ sku, stock }) => ({ sku, stock })), [{ sku: "13", stock: 50 }, { sku: "14", stock: 19 }]);
});

test("SKU product without a matching supplier SKU never falls back to total stock", () => {
  assert.deepEqual(resolveDajuEffectiveStock(detail, null), { ok: false, code: "SUPPLIER_SKU_REQUIRED" });
  assert.deepEqual(resolveDajuEffectiveStock(detail, "missing"), { ok: false, code: "SUPPLIER_SKU_NOT_FOUND" });
});

test("provider failure retains last successful stock and records stale evidence", () => {
  const before = { supplier_stock_snapshot: 50, supplier_stock_last_success_at: "2026-09-14T00:00:00.000Z" };
  const update = buildSupplierStockSnapshotUpdate(50, before, { ok: false, code: "SUPPLIER_READ_FAILED" }, "2026-09-15T00:00:00.000Z");
  assert.equal(update.stock, 50);
  assert.equal(update.metadata.supplier_stock_snapshot, 50);
  assert.equal(update.metadata.supplier_stock_last_success_at, before.supplier_stock_last_success_at);
  assert.equal(update.metadata.supplier_stock_sync_status, "error");
  assert.equal(update.metadata.supplier_stock_stale, true);
  assert.equal(update.metadata.supplier_stock_sync_attempted_at, "2026-09-15T00:00:00.000Z");
});

test("non-SKU supplier product uses authoritative detail stock", () => {
  assert.deepEqual(resolveDajuEffectiveStock({ ...detail, isSku: false, stock: 6 }, null), { ok: true, stock: 6, source: "product" });
});

test("single-SKU legacy product binding falls back without fabricating SKU metadata", () => {
  const parent = { fulfillment_source: "supplier", supplier: "daju", supplier_product_id: 15, supplier_sku: "13", supplier_inputs_mapping: {} };
  const binding = resolveDajuSkuStockBinding(parent, {}, true);
  const resolved = resolveDajuEffectiveStock(detail, binding?.sku);
  const update = buildSupplierStockSnapshotUpdate(0, {}, resolved, "2026-09-15T00:00:00.000Z");
  assert.equal(binding?.sku, "13");
  assert.equal(resolved.stock, 50);
  assert.equal(update.stock, 50);
  assert.equal(sumActiveSupplierSkuStock([{ status: "active", stock: update.stock }]), 50);
  assert.equal(Object.hasOwn(update.metadata, "supplier_sku"), false);
});

test("single-SKU explicit binding overrides the legacy parent binding", () => {
  const parent = { fulfillment_source: "supplier", supplier: "daju", supplier_product_id: 15, supplier_sku: "13", supplier_inputs_mapping: {} };
  const binding = resolveDajuSkuStockBinding(parent, { supplier_sku: "14" }, true);
  assert.equal(binding?.sku, "14");
  assert.equal(resolveDajuEffectiveStock(detail, binding?.sku).stock, 19);

  const directBinding = resolveDajuSkuStockBinding(parent, {
    fulfillment_source: "supplier",
    supplier: "daju",
    supplier_product_id: 16,
    supplier_inputs_mapping: {},
  }, true);
  assert.equal(directBinding?.productId, 16);
  assert.equal(directBinding?.sku, null);
});

test("multi-SKU stock binding never inherits the parent supplier SKU", () => {
  const parent = { fulfillment_source: "supplier", supplier: "daju", supplier_product_id: 15, supplier_sku: "13", supplier_inputs_mapping: {} };
  const missingSku = resolveDajuSkuStockBinding(parent, {}, false);
  const explicitSku = resolveDajuSkuStockBinding(parent, { supplier_sku: "14" }, false);
  assert.equal(missingSku?.sku, null);
  assert.equal(explicitSku?.sku, "14");
});

test("partial sync aggregates successful values with failed SKU last-good stock", () => {
  const failed = buildSupplierStockSnapshotUpdate(50, { supplier_stock_snapshot: 50, supplier_stock_last_success_at: "2026-09-14T00:00:00.000Z" }, { ok: false, code: "SUPPLIER_READ_FAILED" }, "2026-09-15T00:00:00.000Z");
  const aggregate = sumActiveSupplierSkuStock([{ status: "active", stock: failed.stock }, { status: "active", stock: 19 }, { status: "inactive", stock: 99 }]);
  const productUpdate = buildSupplierStockAggregateUpdate({}, aggregate, "2026-09-15T00:00:00.000Z", false);
  assert.equal(failed.stock, 50);
  assert.equal(failed.metadata.supplier_stock_last_success_at, "2026-09-14T00:00:00.000Z");
  assert.equal(productUpdate.stock, 69);
  assert.equal(productUpdate.metadata.supplier_stock_sync_status, "partial");
  assert.equal(productUpdate.metadata.supplier_stock_stale, true);
});

test("batch discovery includes products bound only through SKU metadata", () => {
  assert.deepEqual(
    collectDajuBoundProductIds([{ id: "product-bound" }], [{ product_id: "sku-only" }, { product_id: "product-bound" }]),
    ["product-bound", "sku-only"],
  );
});
