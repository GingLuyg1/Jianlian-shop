import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { evaluateSkuActivationReadiness } from "../../lib/products/sku-activation-readiness.mjs";
import { buildSkuOperationalDiagnostic } from "../../lib/products/fulfillment-inventory-diagnostics.mjs";

const file = (path) => readFileSync(join(process.cwd(), path), "utf8");

test("kuajingzy SKU readiness and operational diagnostic reflect real server purchase gate and MODEL_C sellable cap", () => {
  const nowIso = new Date().toISOString();
  const product = { id: "p-1", delivery_type: "automatic", metadata: { supplier: "kuajingzy" } };
  const sku = {
    id: "sku-1",
    product_id: "p-1",
    sku_code: "tg-p994-6y",
    sku_title: "AZ+994 6年+",
    status: "active",
    stock: 2,
    delivery_type: "automatic",
    metadata: {
      fulfillment_source: "supplier",
      supplier: "kuajingzy",
      supplier_product_id: "imp_12345",
      supplier_sku: null,
      supplier_currency: "CNY",
      supplier_auto_purchase_enabled: true,
      supplier_max_unit_cost: "120",
      supplier_min_unit_profit: "5",
      supplier_min_margin_bps: 1000,
      supplier_stock_snapshot: 10,
      supplier_stock_sync_status: "synced",
      supplier_stock_stale: false,
      supplier_stock_last_success_at: nowIso,
    },
  };

  const enabledEnv = {
    SUPPLIER_AUTO_PURCHASE_ENABLED: "true",
    KUAJINGZY_REAL_PURCHASE_ENABLED: "true",
    KUAJINGZY_MAX_ORDER_COST_CNY: "500",
  };
  const readyResult = evaluateSkuActivationReadiness({
    product,
    sku,
    localAvailableCount: 0,
    purchaseContext: { releaseGate: true, env: enabledEnv },
  });
  assert.equal(readyResult.ready, true);
  assert.deepEqual(readyResult.reasons, []);

  const diag = buildSkuOperationalDiagnostic({
    product,
    sku,
    localAvailableCount: 0,
    activationReadiness: readyResult,
  });
  assert.equal(diag.health, "ready");
  assert.equal(diag.fulfillment_source, "supplier");
  assert.equal(diag.activation.ready, true);

  const disabledResult = evaluateSkuActivationReadiness({
    product,
    sku,
    localAvailableCount: 0,
    purchaseContext: { releaseGate: true, env: { ...enabledEnv, KUAJINGZY_REAL_PURCHASE_ENABLED: "false" } },
  });
  assert.equal(disabledResult.ready, false);
  assert.ok(disabledResult.reasons.includes("SUPPLIER_PURCHASE_DISABLED"));
});

test("admin categories full-count fetch, two-line modal hint, centered icon and moved share button contracts", () => {
  const apiRoute = file("app/api/admin/catalog/products/route.ts");
  const categoriesPage = file("app/admin/categories/page.tsx");
  const modal = file("components/checkout/LiquidGlassCheckoutModal.tsx");
  const checkout = file("app/checkout/page.tsx");

  assert.match(apiRoute, /fetchAllInCategory/);
  assert.match(categoriesPage, /all:\s*true/);
  assert.match(modal, /正在处理订单或存在待支付订单；/);
  assert.match(modal, /如需退出请点击右上角关闭按钮。/);
  assert.match(checkout, /lg:grid-cols-\[220px_minmax\(0,1fr\)\] lg:items-center/);
  const shareIdx = checkout.indexOf('data-testid="checkout-share-button"');
  const emailLabelIdx = checkout.indexOf('<span className="text-red-500">*</span>联系邮箱');
  assert.ok(shareIdx > 0 && emailLabelIdx > 0 && Math.abs(shareIdx - emailLabelIdx) < 900);
});
