import assert from "node:assert/strict";
import test from "node:test";
import { collectFrozenSupplierCodes, resolveSupplierHandlers } from "../../lib/providers/core/supplier-router-core.mjs";

test("router uses frozen supplier bindings and deduplicates supplier codes", () => {
  const result = collectFrozenSupplierCodes([
    { delivery_type: "automatic", delivery_status: "pending", product_snapshot: { supplier_binding: { supplier: "daju" } } },
    { delivery_type: "card", delivery_status: "pending", product_snapshot: { supplier_binding: { supplier: "daju" } } },
    { delivery_type: "account", delivery_status: "pending", product_snapshot: { supplier_binding: { supplier: "supplier_b" } } },
    { delivery_type: "manual", delivery_status: "pending", product_snapshot: { supplier_binding: { supplier: "ignored" } } },
    { delivery_type: "automatic", delivery_status: "delivered", product_snapshot: { supplier_binding: { supplier: "ignored" } } },
  ]);
  assert.deepEqual(result, ["daju", "supplier_b"]);
});

test("router fails closed on malformed frozen supplier codes", () => {
  assert.throws(
    () => collectFrozenSupplierCodes([{ delivery_type: "automatic", delivery_status: "pending", product_snapshot: { supplier_binding: { supplier: " daju " } } }]),
    /SUPPLIER_ROUTING_BINDING_INVALID/,
  );
});

test("router rejects unsupported suppliers before any handler can execute", () => {
  let calls = 0;
  const known = () => { calls += 1; };
  assert.throws(
    () => resolveSupplierHandlers(["daju", "unknown_supplier"], { daju: known }),
    /SUPPLIER_ROUTER_UNSUPPORTED_SUPPLIER/,
  );
  assert.equal(calls, 0);
});
