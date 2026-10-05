import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  DEFAULT_ADMIN_CATALOG_FILTERS,
  buildAdminProductOperationalSummary,
  decorateAdminCatalogProducts,
  filterAndPaginateAdminCatalogProducts,
  getSupplierOperationalStockState,
  matchesAdminCatalogOperations,
  parseAdminCatalogOperationFilters,
  serializeAdminCatalogFilterState,
} from "../../lib/products/admin-catalog-operations.mjs";

const root = process.cwd();
const file = (path) => readFileSync(join(root, path), "utf8");
const filters = (overrides = {}) => ({ ...DEFAULT_ADMIN_CATALOG_FILTERS, ...overrides });
const product = (overrides = {}) => ({
  id: "product-1",
  name: "Apple Gift Card US",
  slug: "gift-apple-us",
  has_skus: true,
  stock: 999,
  status: "active",
  delivery_type: "automatic",
  metadata: {},
  ...overrides,
});
const sku = (index, overrides = {}) => ({
  id: `sku-${index}`,
  product_id: "product-1",
  status: "draft",
  stock: 0,
  metadata: { inventory_state: "requires_verification" },
  ...overrides,
});
const giftSkus = Array.from({ length: 10 }, (_, index) => sku(index + 1));
const dajuBinding = {
  fulfillment_source: "supplier",
  supplier: "daju",
  supplier_product_id: 15,
  supplier_sku: "13",
  supplier_inputs_mapping: {},
  supplier_max_unit_cost: "12.00",
};
const digApple = product({
  id: "product-2",
  name: "Apple ID US",
  slug: "dig-apple-id-us",
  has_skus: false,
  stock: 8,
  metadata: dajuBinding,
});

test("multi_sku and single_product filters use products.has_skus", () => {
  const giftSummary = buildAdminProductOperationalSummary(product(), giftSkus);
  const digSummary = buildAdminProductOperationalSummary(digApple, []);
  assert.equal(matchesAdminCatalogOperations(product(), giftSummary, filters({ productType: "multi_sku" })), true);
  assert.equal(matchesAdminCatalogOperations(digApple, digSummary, filters({ productType: "multi_sku" })), false);
  assert.equal(matchesAdminCatalogOperations(digApple, digSummary, filters({ productType: "single_product" })), true);
});

test("zero, low and in-stock filters use active SKU aggregate rather than parent stock", () => {
  const giftSummary = buildAdminProductOperationalSummary(product({ stock: 999 }), giftSkus);
  assert.equal(giftSummary.effective_stock, 0);
  assert.equal(matchesAdminCatalogOperations(product(), giftSummary, filters({ stockLevel: "zero_stock" })), true);
  const activeSkus = [sku(1, { status: "active", stock: 4, metadata: {} }), sku(2, { status: "draft", stock: 100 })];
  const activeSummary = buildAdminProductOperationalSummary(product(), activeSkus);
  assert.equal(activeSummary.effective_stock, 4);
  assert.equal(matchesAdminCatalogOperations(product(), activeSummary, filters({ stockLevel: "low_stock" })), true);
  assert.equal(matchesAdminCatalogOperations(product(), activeSummary, filters({ stockLevel: "in_stock" })), true);
});

test("all_draft, no_active, has_active and sold-out SKU filters remain distinct", () => {
  const draftSummary = buildAdminProductOperationalSummary(product(), giftSkus);
  assert.equal(matchesAdminCatalogOperations(product(), draftSummary, filters({ skuStatus: "all_draft" })), true);
  assert.equal(matchesAdminCatalogOperations(product(), draftSummary, filters({ skuStatus: "no_active_sku" })), true);
  const mixed = [sku(1, { status: "active", stock: 3 }), sku(2, { status: "sold_out" })];
  const mixedSummary = buildAdminProductOperationalSummary(product(), mixed);
  assert.equal(matchesAdminCatalogOperations(product(), mixedSummary, filters({ skuStatus: "has_active_sku" })), true);
  assert.equal(matchesAdminCatalogOperations(product(), mixedSummary, filters({ skuStatus: "has_sold_out_sku" })), true);
});

test("has_skus=false products never match SKU operational status filters", () => {
  const summary = buildAdminProductOperationalSummary(digApple, []);
  for (const skuStatus of ["has_active_sku", "all_draft", "has_sold_out_sku", "no_active_sku"]) {
    assert.equal(matchesAdminCatalogOperations(digApple, summary, filters({ skuStatus })), false);
  }
});

test("supplier binding filter reports any unbound SKU without claiming fulfillment failure", () => {
  const giftSummary = buildAdminProductOperationalSummary(product(), giftSkus);
  const digSummary = buildAdminProductOperationalSummary(digApple, []);
  assert.equal(giftSummary.supplier_unbound, 10);
  assert.equal(matchesAdminCatalogOperations(product(), giftSummary, filters({ supplierBinding: "supplier_unbound" })), true);
  assert.equal(digSummary.supplier_bound, true);
  assert.equal(matchesAdminCatalogOperations(digApple, digSummary, filters({ supplierBinding: "supplier_bound" })), true);
});

test("supplier stock unknown, fresh, stale and error reuse existing sync metadata", () => {
  assert.equal(getSupplierOperationalStockState(dajuBinding), "unknown");
  assert.equal(getSupplierOperationalStockState({ ...dajuBinding, supplier_stock_sync_status: "synced", supplier_stock_last_success_at: "2026-10-01T00:00:00.000Z", supplier_stock_stale: false }), "fresh");
  assert.equal(getSupplierOperationalStockState({ ...dajuBinding, supplier_stock_sync_status: "synced", supplier_stock_last_success_at: "2026-10-01T00:00:00.000Z", supplier_stock_stale: true }), "stale");
  assert.equal(getSupplierOperationalStockState({ ...dajuBinding, supplier_stock_sync_status: "error", supplier_stock_stale: true }), "error");
  const unknownSummary = buildAdminProductOperationalSummary(digApple, []);
  assert.equal(matchesAdminCatalogOperations(digApple, unknownSummary, filters({ supplierStock: "unknown" })), true);
});

test("requires_verification and no-verification filters are exact flags", () => {
  const giftSummary = buildAdminProductOperationalSummary(product(), giftSkus);
  assert.equal(giftSummary.requires_verification, 10);
  assert.equal(matchesAdminCatalogOperations(product(), giftSummary, filters({ inventoryVerification: "requires_verification" })), true);
  const clearRows = giftSkus.map((row) => ({ ...row, metadata: {} }));
  const clearSummary = buildAdminProductOperationalSummary(product(), clearRows);
  assert.equal(matchesAdminCatalogOperations(product(), clearSummary, filters({ inventoryVerification: "no_verification_flag" })), true);
});

test("search combines with operational filters", () => {
  const summary = buildAdminProductOperationalSummary(product(), giftSkus);
  assert.equal(matchesAdminCatalogOperations(product(), summary, filters({ search: "apple", productType: "multi_sku", stockLevel: "zero_stock" })), true);
  assert.equal(matchesAdminCatalogOperations(product(), summary, filters({ search: "giffgaff", productType: "multi_sku", stockLevel: "zero_stock" })), false);
});

test("filtered pagination is applied after SKU operational matching", () => {
  const products = [
    product({ id: "product-1", name: "Apple A" }),
    product({ id: "product-2", name: "Apple B" }),
    product({ id: "product-3", name: "Apple C" }),
  ];
  const skus = products.flatMap((row) => [sku(row.id, { id: `sku-${row.id}`, product_id: row.id })]);
  const result = filterAndPaginateAdminCatalogProducts(products, skus, filters({ productType: "multi_sku", stockLevel: "zero_stock", page: 2, pageSize: 2 }));
  assert.equal(result.count, 3);
  assert.deepEqual(result.products.map((row) => row.id), ["product-3"]);
});

test("invalid enum query parameters fail validation while legacy low maps safely", () => {
  const invalid = parseAdminCatalogOperationFilters(new URLSearchParams("type=product_skus);drop table products"));
  assert.equal(invalid.ok, false);
  assert.deepEqual(invalid.invalid, ["type"]);
  const legacy = parseAdminCatalogOperationFilters(new URLSearchParams("stockLevel=low"));
  assert.equal(legacy.ok, true);
  assert.equal(legacy.filters.stockLevel, "low_stock");
});

test("URL filter serialization and parsing are refresh-safe and omit defaults", () => {
  const params = serializeAdminCatalogFilterState({
    search: "apple",
    primaryCategory: "gift-cards",
    secondaryCategory: "apple",
    productType: "multi_sku",
    productStatus: "draft",
    deliveryType: "automatic",
    skuStatus: "all_draft",
    stockLevel: "zero_stock",
    supplierBinding: "supplier_unbound",
    supplierStock: "unknown",
    inventoryVerification: "requires_verification",
    fulfillmentHealth: "blocked",
    sortBy: "updated_at",
    page: 2,
    pageSize: 50,
  });
  const parsed = parseAdminCatalogOperationFilters(params);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.filters.search, "apple");
  assert.equal(parsed.filters.productType, "multi_sku");
  assert.equal(parsed.filters.stockLevel, "zero_stock");
  assert.equal(parsed.filters.fulfillmentHealth, "blocked");
  assert.equal(parsed.filters.page, 2);
  assert.equal(params.get("primaryCategory"), "gift-cards");
  assert.equal(params.get("secondaryCategory"), "apple");
  assert.equal(new URLSearchParams(serializeAdminCatalogFilterState(DEFAULT_ADMIN_CATALOG_FILTERS)).toString(), "");
});

test("gift-apple-us fixture exposes the expected operational summary", () => {
  const [decorated] = decorateAdminCatalogProducts([product()], giftSkus, filters());
  assert.deepEqual(decorated.operational_summary, {
    sku_total: 10,
    sku_active: 0,
    sku_draft: 10,
    sku_sold_out: 0,
    effective_stock: 0,
    supplier_unbound: 10,
    supplier_bound: false,
    requires_verification: 10,
    supplier_stock_unknown: 10,
    supplier_stock_fresh: 0,
    supplier_stock_stale: 0,
    supplier_stock_error: 0,
    fulfillment_ready: 0,
    fulfillment_attention: 0,
    fulfillment_blocked: 10,
    fulfillment_unknown: 0,
    fulfillment_no_source: 10,
    local_inventory_available: 0,
    inventory_diagnostics_failed: false,
  });
});

test("dig-apple-id-us fixture is single, supplier-bound and stock-unknown", () => {
  const summary = buildAdminProductOperationalSummary(digApple, []);
  assert.equal(summary.supplier_bound, true);
  assert.equal(summary.supplier_stock_unknown, 1);
  assert.equal(summary.effective_stock, 8);
  assert.equal(summary.fulfillment_ready, 0);
});

test("fulfillment health filter is server-side, filter-before-pagination and uses local inventory evidence", () => {
  const rows = [sku(1, { id: "sku-ready", status: "active", stock: 2, metadata: {} })];
  const inventoryContext = { availableBySku: { "sku-ready": 2 }, error: false };
  const summary = buildAdminProductOperationalSummary(product(), rows, inventoryContext);
  assert.equal(summary.fulfillment_ready, 1);
  assert.equal(matchesAdminCatalogOperations(product(), summary, filters({ fulfillmentHealth: "ready" })), true);
  const result = filterAndPaginateAdminCatalogProducts([product()], rows, filters({ fulfillmentHealth: "ready", page: 1, pageSize: 20 }), inventoryContext);
  assert.equal(result.count, 1);
  assert.equal(result.products[0].operational_summary.local_inventory_available, 1);
});

test("API uses bounded batch SKU reads and the UI keeps filters in URL state", () => {
  const route = file("app/api/admin/catalog/products/route.ts");
  const page = file("app/admin/products/page.tsx");
  assert.match(route, /SKU_PRODUCT_BATCH_SIZE/);
  assert.match(route, /\.from\("product_skus"\)/);
  assert.match(route, /Promise\.all\(batches\.map/);
  assert.match(route, /readSkuLocalInventoryDiagnostics/);
  assert.match(route, /queryCount = 1 \+ skuResult\.queryCount \+ inventoryResult\.queryCount/);
  assert.doesNotMatch(route, /supplier.*fetch|sync_daju_supplier_stock/i);
  assert.match(page, /serializeAdminCatalogFilterState/);
  assert.match(page, /router\.replace/);
  assert.match(page, /已启用 \{activeProductFilters\.length\} 个筛选/);
});
