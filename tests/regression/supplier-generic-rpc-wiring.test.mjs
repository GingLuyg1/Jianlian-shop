import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Daju fulfillment store uses the generic supplier database contract", () => {
  const source = fs.readFileSync("lib/providers/daju/fulfillment.ts", "utf8");
  assert.ok(source.includes('service.rpc("claim_supplier_fulfillment"'));
  assert.ok(source.includes('service.rpc("record_supplier_fulfillment_outcome"'));
  assert.ok(source.includes('p_supplier: "daju"'));
  assert.ok(source.includes('p_supplier_product_id: String(candidate.binding.productId)'));
  assert.ok(!source.includes('claim_daju_supplier_fulfillment'));
  assert.ok(!source.includes('record_daju_supplier_fulfillment_outcome'));
});
