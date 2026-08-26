import assert from "node:assert/strict";
import test from "node:test";
import { collectFrozenSupplierCodes, executeSupplierHandlers, resolveSupplierHandlers } from "../../lib/providers/core/supplier-router-core.mjs";

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

test("router resolves multiple frozen suppliers independently without fallback", async () => {
  const calls = [];
  const registry = {
    daju: async () => { calls.push("daju"); return { handled: 1, fulfilled: 1, failed: 0, uncertain: 0, needsInput: 0 }; },
    supplier_b: async () => { calls.push("supplier_b"); return { handled: 2, fulfilled: 2, failed: 0, uncertain: 0, needsInput: 0 }; },
  };
  const handlers = resolveSupplierHandlers(["daju", "supplier_b"], registry);
  const results = [];
  for (const handler of handlers) results.push(await handler());
  assert.deepEqual(calls, ["daju", "supplier_b"]);
  assert.deepEqual(results, [
    { handled: 1, fulfilled: 1, failed: 0, uncertain: 0, needsInput: 0 },
    { handled: 2, fulfilled: 2, failed: 0, uncertain: 0, needsInput: 0 },
  ]);
});

test("router executes supplier handlers once and aggregates summaries", async () => {
  const calls = [];
  const handlers = ["daju", "supplier_b"];
  const result = await executeSupplierHandlers(handlers, async (supplier) => {
    calls.push(supplier);
    return supplier === "daju"
      ? { handled: 1, fulfilled: 1, failed: 0, uncertain: 0, needsInput: 0 }
      : { handled: 2, fulfilled: 1, failed: 1, uncertain: 0, needsInput: 1 };
  });
  assert.deepEqual(calls, ["daju", "supplier_b"]);
  assert.deepEqual(result, { handled: 3, fulfilled: 2, failed: 1, uncertain: 0, needsInput: 1 });
});
