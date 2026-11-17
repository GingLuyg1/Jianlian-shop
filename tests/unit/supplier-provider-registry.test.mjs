import assert from "node:assert/strict";
import test from "node:test";

import {
  canSupplierAutoPurchase,
  discoverSupplierProvider,
} from "../../lib/providers/core/supplier-router-core.mjs";

test("supplier capability registry exposes integrated providers without widening purchase gates", () => {
  const daju = discoverSupplierProvider("daju");
  const bitrefill = discoverSupplierProvider("bitrefill");
  const kuajingzy = discoverSupplierProvider("kuajingzy");

  assert.equal(daju.capabilities.purchase, true);
  assert.equal(canSupplierAutoPurchase("daju"), true);

  assert.equal(bitrefill.capabilities.catalog, true);
  assert.equal(bitrefill.capabilities.purchase, false);
  assert.equal(bitrefill.capabilities.productionWiring, "release_gated");
  assert.equal(canSupplierAutoPurchase("bitrefill"), false);

  assert.equal(kuajingzy.capabilities.catalog, true);
  assert.equal(kuajingzy.capabilities.purchase, false);
  assert.equal(canSupplierAutoPurchase("kuajingzy"), false);
});

test("supplier capability registry remains fail-closed for unknown suppliers", () => {
  assert.throws(
    () => discoverSupplierProvider("unknown"),
    /SUPPLIER_ROUTER_UNSUPPORTED_SUPPLIER/,
  );
});
