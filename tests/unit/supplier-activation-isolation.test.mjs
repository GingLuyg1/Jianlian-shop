import assert from "node:assert/strict";
import test from "node:test";

import { evaluateSkuActivationReadiness } from "../../lib/products/sku-activation-readiness.mjs";

test("existing Daju exact quantity and local inventory activation paths remain unchanged", () => {
  const daju = evaluateSkuActivationReadiness({ product: { delivery_type: "automatic" }, sku: {
    stock: 5, metadata: { fulfillment_source: "supplier", supplier: "daju", supplier_product_id: 15,
      supplier_sku: "13", supplier_inputs_mapping: {}, supplier_max_unit_cost: "8.50",
      supplier_stock_snapshot: 5, supplier_stock_sync_status: "synced",
      supplier_stock_last_success_at: "2026-10-15T00:00:00Z", supplier_stock_stale: false },
  } });
  assert.equal(daju.ready, true);
  assert.equal(daju.source, "supplier");
  const local = evaluateSkuActivationReadiness({ product: { delivery_type: "automatic" },
    sku: { stock: 1, metadata: {} }, localAvailableCount: 1 });
  assert.equal(local.ready, true);
  assert.equal(local.source, "local_inventory");
});

test("boolean Bitrefill evidence alone never activates an Apple SKU", () => {
  const result = evaluateSkuActivationReadiness({ product: { delivery_type: "automatic" }, sku: {
    stock: 0, metadata: { fulfillment_source: "supplier", supplier: "bitrefill", supplier_product_id: "apple-usa",
      supplier_sku: "unverified", supplier_stock_available: true, supplier_quantity_known: false,
      supplier_stock_sync_status: "synced", supplier_stock_stale: false,
      supplier_stock_last_success_at: "2026-10-15T00:00:00Z" },
  } });
  assert.equal(result.ready, false);
  assert.equal(result.source, "none");
  assert.ok(result.reasons.includes("ZERO_STOCK"));
  assert.ok(result.reasons.includes("SUPPLIER_BINDING_INCOMPLETE"));
});
