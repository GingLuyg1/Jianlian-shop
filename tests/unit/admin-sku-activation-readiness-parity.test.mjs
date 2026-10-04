import assert from "node:assert/strict";
import test from "node:test";

import { evaluateSkuActivationReadiness } from "../../lib/products/sku-activation-readiness.mjs";
import { ACTIVATION_READINESS_FIXTURES } from "../fixtures/admin-sku-activation-readiness.mjs";

const product = { id: "product", delivery_type: "automatic", stock: 999, metadata: { fulfillment_source: "supplier", supplier: "daju", supplier_product_id: 15 } };

test("shared readiness fixture matrix preserves the JS Preview contract used by SQL parity cases", () => {
  for (const fixture of ACTIVATION_READINESS_FIXTURES) {
    const result = evaluateSkuActivationReadiness({
      product,
      sku: { id: fixture.name, product_id: product.id, delivery_type: "automatic", stock: fixture.stock, metadata: fixture.metadata },
      localAvailableCount: fixture.localAvailableCount,
    });
    assert.equal(result.ready, fixture.ready, fixture.name);
    assert.deepEqual(result.reasons, fixture.reasons, fixture.name);
  }
});

test("parent stock and parent supplier metadata are intentionally absent from fixture authority", () => {
  const result = evaluateSkuActivationReadiness({
    product,
    sku: { id: "sku", product_id: product.id, delivery_type: "automatic", stock: 1, metadata: {} },
    localAvailableCount: 0,
  });
  assert.equal(result.ready, false);
  assert.deepEqual(result.reasons, ["LOCAL_INVENTORY_EMPTY", "NO_FULFILLMENT_SOURCE"]);
});
