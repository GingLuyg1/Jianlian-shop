import assert from "node:assert/strict";
import test from "node:test";

import { buildSupplierPurchaseIdentity, classifySupplierSubmitBoundary } from "../../lib/providers/core/purchase-identity-core.mjs";

const base = { provider: "bitrefill", orderItemId: "item-1", requestId: "jianlian:order-1:item-1",
  attemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", productId: "steam-usa", packageId: "steam-usa<&>30",
  quantity: 1, amount: "30.00", currency: "USD" };

test("semantic identity is deterministic, frozen and excludes arbitrary secrets", () => {
  const first = buildSupplierPurchaseIdentity({ ...base, apiKey: "PRIVATE", redemptionCode: "PRIVATE" });
  assert.match(first.semanticHash, /^[0-9a-f]{64}$/);
  assert.equal(first.semanticHash, buildSupplierPurchaseIdentity(base).semanticHash);
  assert.equal(JSON.stringify(first).includes("PRIVATE"), false);
  for (const change of [{ productId: "other" }, { packageId: "other" }, { quantity: 2 },
    { amount: "31.00" }, { currency: "CAD" }, { orderItemId: "item-2" }]) {
    assert.notEqual(buildSupplierPurchaseIdentity({ ...base, ...change }).semanticHash, first.semanticHash);
  }
});

test("semantic identity rejects malformed money, identifiers and quantity", () => {
  for (const change of [{ amount: 30 }, { amount: "0" }, { amount: "-1" }, { amount: "1e3" },
    { amount: "9999999999999999999" }, { currency: "usd" }, { quantity: 0 }, { quantity: 21 },
    { packageId: "x\nforged-log" }, { productId: "<script>" }]) {
    assert.throws(() => buildSupplierPurchaseIdentity({ ...base, ...change }), /SUPPLIER_PURCHASE_/);
  }
});

test("post-submit uncertainty never permits blind retry", () => {
  assert.deepEqual(classifySupplierSubmitBoundary({ submitMayHaveLeft: true }),
    { state: "UNCERTAIN", retryPurchase: false, next: "MANUAL_REVIEW" });
  assert.deepEqual(classifySupplierSubmitBoundary({ submitMayHaveLeft: true, externalInvoiceId: "inv-1" }),
    { state: "UNCERTAIN", retryPurchase: false, next: "QUERY_ONLY" });
  assert.deepEqual(classifySupplierSubmitBoundary({ submitMayHaveLeft: false, durableState: "BEFORE_SUBMIT" }),
    { state: "BEFORE_SUBMIT", retryPurchase: true, next: "REVALIDATE_FROZEN_REQUEST" });
  assert.equal(classifySupplierSubmitBoundary({}).retryPurchase, false);
});
