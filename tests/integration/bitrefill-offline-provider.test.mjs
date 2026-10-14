import assert from "node:assert/strict";
import test from "node:test";

import {
  BitrefillDeliveryDeduplicator,
  BitrefillProvider,
  buildBitrefillInvoiceRequest,
  classifyBitrefillSubmitFailure,
  normalizeBitrefillProduct,
  reconcileBitrefillInvoice,
} from "../../lib/providers/bitrefill/provider-core.mjs";
import { BitrefillFakeTransport } from "../../lib/providers/bitrefill/transport.mjs";

function setup(overrides = {}) {
  const rawProduct = {
    id: "fixture-steam-us", name: "Fixture Steam US", country: "US", currency: "USD", type: "gift_card", inStock: true,
    packages: [{ packageId: "fixture-steam-us<&>20", value: 20, price: 19 }], range: null,
    ...overrides.product,
  };
  const product = normalizeBitrefillProduct(rawProduct);
  const item = {
    binding: { supplier: "bitrefill", productId: "fixture-steam-us", sku: "fixture-steam-us<&>20", currency: "USD", faceValue: "20" },
    product, quantity: 1, expectedCost: "19", frozenQuotedCost: "19", frozenMaxSupplierCost: "20",
    ...overrides.item,
  };
  return { rawProduct, product, item };
}

test("offline E2E fixed package succeeds through fake invoice/order/redemption", async () => {
  const { item } = setup();
  const transport = new BitrefillFakeTransport({ invoice: {
    id: "inv-ok", status: "complete", orders: [{ id: "ord-ok", status: "delivered", redemption_info: { code: "FIXTURE-DELIVERY" } }],
  } });
  const provider = new BitrefillProvider(transport);
  const invoice = await provider.createOrder(buildBitrefillInvoiceRequest({ items: [item] }));
  const result = reconcileBitrefillInvoice(invoice);
  assert.equal(result.state, "SUCCEEDED");
  assert.equal(result.deliveryCandidates[0].redemption.storage, "digital_delivery_secrets");
});

test("offline E2E out-of-stock blocks before fake invoice", () => {
  const { item } = setup({ product: { inStock: false } });
  const transport = new BitrefillFakeTransport();
  assert.throws(() => buildBitrefillInvoiceRequest({ items: [item] }), /OUT_OF_STOCK/);
  assert.equal(transport.invoiceSubmissions, 0);
});

test("offline E2E cost limit blocks before fake invoice", () => {
  const { item } = setup({ item: { expectedCost: "20.01", frozenQuotedCost: "20.01", frozenMaxSupplierCost: "20" } });
  const transport = new BitrefillFakeTransport();
  assert.throws(() => buildBitrefillInvoiceRequest({ items: [item] }), /PURCHASE_COST_LIMIT/);
  assert.equal(transport.invoiceSubmissions, 0);
});

test("offline E2E unknown submit becomes UNCERTAIN with no second purchase", async () => {
  const { item } = setup();
  const transport = new BitrefillFakeTransport({ submitTimeoutAfterAccept: true });
  const provider = new BitrefillProvider(transport);
  let outcome;
  try { await provider.createOrder(buildBitrefillInvoiceRequest({ items: [item] })); } catch (error) { outcome = classifyBitrefillSubmitFailure(error); }
  assert.equal(outcome.state, "UNCERTAIN");
  assert.equal(outcome.retryPurchase, false);
  assert.equal(outcome.next, "RECONCILIATION_REQUIRED");
  assert.equal(transport.invoiceSubmissions, 1);
});

test("offline E2E partial invoice exposes only delivered candidate", () => {
  const result = reconcileBitrefillInvoice({ id: "inv-partial", status: "complete", orders: [
    { id: "ord-a", status: "delivered", redemption_info: { code: "FIXTURE-A" } },
    { id: "ord-b", status: "failed" },
  ] });
  assert.equal(result.state, "RECONCILIATION_REQUIRED");
  assert.deepEqual(result.deliveryCandidates.map((entry) => entry.order_id), ["ord-a"]);
  assert.deepEqual(result.failedOrderIds, ["ord-b"]);
});

test("offline E2E duplicate webhook/reconciliation can claim delivery once", () => {
  const guard = new BitrefillDeliveryDeduplicator();
  const invoice = { id: "inv-dup", status: "complete", orders: [{ id: "ord-dup", status: "delivered", redemption_info: { code: "FIXTURE-DUP" } }] };
  const first = reconcileBitrefillInvoice(invoice).deliveryCandidates.filter((order) => guard.claim(order.order_id));
  const second = reconcileBitrefillInvoice(invoice).deliveryCandidates.filter((order) => guard.claim(order.order_id));
  assert.equal(first.length, 1);
  assert.equal(second.length, 0);
});
