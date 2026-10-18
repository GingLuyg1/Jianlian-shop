import assert from "node:assert/strict";
import test from "node:test";

import { fulfillSupplierCandidates } from "../../lib/providers/core/fulfillment-core.mjs";
import { BitrefillFakeTransport } from "../../lib/providers/bitrefill/transport.mjs";

const invoice = { id: "invoice-1", status: "complete", orders: [{ id: "external-order-1", status: "delivered",
  redemption_info: { code: "PRIVATE-DELIVERY" } }] };

function memoryStore(initial) {
  const row = { ...initial };
  const deliveryRows = new Set(initial.status === "FULFILLED" ? ["item-1"] : []);
  return {
    row, deliveryRows,
    async claim(_candidate, requestId) {
      assert.equal(requestId, "jianlian:order-1:item-1");
      if (!row.status) { row.status = "PURCHASING"; row.attemptToken = "attempt-1"; return { action: "PURCHASE", ...row }; }
      if (row.status === "FULFILLED") return { action: "NONE", ...row };
      if (row.orderCode) return { action: "QUERY", ...row };
      return { action: "NONE", ...row };
    },
    async recordOutcome(outcome) {
      row.status = outcome.state;
      row.orderCode = outcome.orderCode ?? null;
      if (outcome.state === "FULFILLED") {
        // Mirrors the single-RPC SQL delivery uniqueness/atomicity contract only;
        // this in-memory fixture is not production crash recovery.
        deliveryRows.add("item-1");
      }
    },
  };
}

async function restartAt(point) {
  const fake = new BitrefillFakeTransport({ invoice, reconciledInvoice: invoice, products: {
    "fixture-product": { id: "fixture-product", inStock: true, packages: [] },
  } });
  const initial = point === "before_claim" ? {} : point === "after_claim_before_submit" ? { status: "PURCHASING", attemptToken: "a1", orderCode: null }
    : point === "after_submit_before_id" ? { status: "UNCERTAIN", attemptToken: "a1", orderCode: null }
      : point === "after_id_before_query" ? { status: "PURCHASING", attemptToken: "a1", orderCode: "invoice-1" }
        : { status: "FULFILLED", attemptToken: "a1", orderCode: "invoice-1" };
  if (point === "after_submit_before_id") await fake.createInvoice({ products: [{ product_id: "fixture-product", package_id: "fixed", quantity: 1 }] });
  const store = memoryStore(initial);
  const client = {
    getProduct: (productId) => fake.readProduct(productId).then((result) => ({ ...result.product, price: "9.50" })),
    purchase: (request) => fake.createInvoice(request).then((value) => ({ ...value, orderCode: value.id })),
    getOrder: () => fake.readInvoice().then((value) => ({ ...value, orderCode: value.id })),
  };
  const run = () => fulfillSupplierCandidates({
    candidates: [{ orderId: "order-1", orderItemId: "item-1", quantity: 1,
      binding: { productId: "fixture-product", sku: "fixed" }, bindingInvalid: false }],
    triggerSource: "offline-fixture", createRequestId: (orderId, itemId) => `jianlian:${orderId}:${itemId}`,
    store, client,
    validateReadiness: () => ({ ok: true, inputs: {} }),
    decideError: () => ({ state: "UNCERTAIN", retryable: false, code: "POST_SUBMIT_TIMEOUT" }),
    decideOrderResult: (result) => result.status === "complete" ? { kind: "fulfilled" } : { kind: "reconciliation", code: "PENDING" },
    extractDeliveredContent: (result) => result.orders[0]?.redemption_info?.code ?? null,
    outcome: (_candidate, _claim, requestId, state, retryable, code, extra = {}) => ({ requestId, state, retryable, code, ...extra }),
  });
  const first = await run();
  const second = await run();
  return { fake, store, first, second };
}

for (const [point, purchases, delivered, uncertain] of [
  ["before_claim", 1, true, false],
  ["after_claim_before_submit", 0, false, true],
  ["after_submit_before_id", 1, false, true],
  ["after_id_before_query", 0, true, false],
  ["after_delivery_commit_before_ack", 0, true, false],
]) {
  test(`offline crash point ${point} has no duplicate purchase or delivery`, async () => {
    const { fake, store, first, second } = await restartAt(point);
    assert.equal(fake.invoiceSubmissions, purchases);
    assert.equal(store.deliveryRows.size, delivered ? 1 : 0);
    assert.equal(first.uncertain > 0, uncertain);
    assert.equal(second.uncertain > 0, uncertain);
    assert.equal(fake.orderReads, 0);
    assert.equal(fake.invoiceReads, point === "after_id_before_query" ? 1 : 0);
    if (point === "after_submit_before_id") {
      assert.equal(store.row.status, "UNCERTAIN");
      assert.equal(store.row.orderCode, null);
    }
  });
}
