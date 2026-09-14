import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const file = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("admin product edit exposes database SKU management and existing supplier binding", () => {
  const page = file("app/admin/products/page.tsx");
  const manager = file("components/admin/products/AdminProductSkuManager.tsx");
  assert.match(page, /AdminProductSkuManager/);
  assert.match(manager, /ensureTrailingEmptySkuRow/);
  assert.match(manager, /SKU 名称/);
  assert.match(manager, /SKU Code/);
  assert.match(manager, /绑定供货商/);
  assert.match(manager, /onSupplierBinding\(product, row\.sku!/);
  assert.match(manager, /createProductSku/);
  assert.match(manager, /updateProductSku/);
  assert.match(manager, /deleteProductSku/);
});

test("supplier binding provides friendly SKU choices and saves website SKU mapping", () => {
  const sheet = file("components/admin/suppliers/AdminSupplierBindingSheet.tsx");
  const route = file("app/api/admin/suppliers/daju/bindings/[productId]/route.ts");
  assert.match(sheet, /listDajuSkuStockOptions/);
  assert.match(sheet, /Supplier SKU:/);
  assert.match(sheet, /成本:/);
  assert.match(sheet, /库存:/);
  assert.match(sheet, /website_sku_id/);
  assert.match(route, /from\("product_skus"\)/);
  assert.match(route, /DAJU_SUPPLIER_SKU_REQUIRED/);
  assert.match(route, /supplier_stock_snapshot/);
});

test("stock sync preserves snapshots and never performs supplier purchase", () => {
  const service = file("lib/providers/daju/stock-sync.ts");
  const route = file("app/api/admin/suppliers/daju/stock/[productId]/route.ts");
  const batchRoute = file("app/api/admin/suppliers/daju/stock/route.ts");
  assert.match(service, /syncDajuProductStock/);
  assert.match(service, /buildSupplierStockSnapshotUpdate/);
  assert.match(service, /resolveDajuSkuStockBinding\(metadataOf\(productRow\.metadata\), metadata, rows\.length === 1\)/);
  assert.match(service, /effectiveRows\.push\(\{ status: row\.status, stock: row\.stock \}\)/);
  assert.match(service, /buildSupplierStockAggregateUpdate/);
  assert.match(batchRoute, /from\("product_skus"\)/);
  assert.match(batchRoute, /collectDajuBoundProductIds/);
  assert.doesNotMatch(service, /\.purchase\s*\(/);
  assert.doesNotMatch(route, /\.purchase\s*\(/);
  assert.doesNotMatch(batchRoute, /\.purchase\s*\(/);
  assert.match(route, /sync_daju_supplier_stock/);
});

test("checkout prioritizes database SKU above email and disables unavailable variants", () => {
  const checkout = file("app/checkout/page.tsx");
  const selector = checkout.indexOf("<SkuSelector");
  const email = checkout.indexOf("联系邮箱", selector);
  assert.ok(selector > 0 && selector < email);
  assert.match(checkout, /databaseSkuOptions\.length > 0/);
  assert.match(checkout, /sku\.status !== "active" \|\| Number\(sku\.stock \?\? 0\) <= 0/);
  assert.match(checkout, /sku_id: selectedDatabaseSkuId/);
  assert.match(checkout, /unitPrice = product \? \(hasSku \? selectedSku\?\.rmb/);
});

test("legacy balance summary is removed and insufficient balance uses retained-order dialog", () => {
  const checkout = file("app/checkout/page.tsx");
  assert.doesNotMatch(checkout, /className="space-y-2 rounded-xl border border\[#ead9cc\]/);
  assert.match(checkout, /<Dialog open=\{balanceDialogOpen\}/);
  assert.match(checkout, /账户余额不足/);
  assert.match(checkout, /当前余额/);
  assert.match(checkout, /本次支付/);
  assert.match(checkout, /还需充值/);
  assert.match(checkout, /params\.set\("sku", selectedSku\.id\)/);
  assert.match(checkout, /setSelectedSkuId\(\(current\) => requestedSkuId \|\| current\)/);
  assert.match(checkout, /balance_insufficient_existing_order/);
  assert.match(checkout, /setPendingBalanceOrder\(existingOrder\)[\s\S]*setBalanceDialogOpen\(true\)/);
  assert.match(checkout, /clientRequestIdRef\.current = requestId/);
});
