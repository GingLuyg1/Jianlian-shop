import assert from "node:assert/strict";
import test from "node:test";
import { BitrefillFakeTransport, BitrefillHttpTransport } from "../../lib/providers/bitrefill/transport.mjs";
import { createLocalBitrefillFulfillment, dispatchLocalPaidSuppliers,
  validateLocalFinancialEvidence } from "../../lib/providers/bitrefill/paid-order-local.mjs";

const binding = { fulfillment_source: "supplier", supplier: "bitrefill",
  supplier_product_id: "synthetic-gift", supplier_sku: "synthetic-5", supplier_min_unit_profit: "1.00" };
const candidate = { order: { id: "order-1", currency: "USD" }, orderItem: {
  id: "item-1", unit_price: "6.00", product_snapshot: { supplier_binding: binding } } };
const evidence = { source: "synthetic_paid_ledger", orderId: "order-1", orderItemId: "item-1",
  currency: "USD", paidItemAmount: "6.00", paymentFee: "0.10", maxUnitProfit: "2.00",
  fxSource: "same_currency_no_conversion" };
const quote = { synthetic: true, currency: "USD", amount: "4.80" };
test("P2 net profit includes actual item payment and fee, blocks FX, face-value source and missing cost", () => {
  assert.equal(validateLocalFinancialEvidence(candidate, evidence, quote).paymentFee, "0.10");
  for (const change of [{ paymentFee: "1.00" }, { paidItemAmount: "5.00" },
    { currency: "CNY" }, { fxSource: "guessed" }, { source: "browser" },
    { paymentFee: "-1" }, { maxUnitProfit: "0.01" }]) {
    assert.throws(() => validateLocalFinancialEvidence(candidate, { ...evidence, ...change }, quote), /BITREFILL_P2_/);
  }
  assert.throws(() => validateLocalFinancialEvidence(candidate, evidence, { ...quote, synthetic: false }), /BITREFILL_P2_/);
  assert.throws(() => validateLocalFinancialEvidence(candidate, evidence, { ...quote, amount: undefined }), /BITREFILL_P2_/);
});

test("P2 factory rejects real HTTP before any network; requires explicit FakeTransport", () => {
  const http = new BitrefillHttpTransport({ authMode: "personal", apiKey: "synthetic-key",
    fetchImpl: async () => { throw new Error("NETWORK_FORBIDDEN"); } });
  assert.throws(() => createLocalBitrefillFulfillment({ transport: http,
    loadPricing: async () => {}, loadFinancialEvidence: async () => {} }), /BITREFILL_P2_FAKE_ONLY/);
  assert.equal(typeof createLocalBitrefillFulfillment({ transport: new BitrefillFakeTransport(),
    loadPricing: async () => {}, loadFinancialEvidence: async () => {} }), "function");
});

function service(items, paymentStatus = "paid") {
  return { from(table) { return { select() { return { eq() {
    return Promise.resolve({ data: table === "orders" ? [{ id: "order-1", status: "paid",
      payment_status: paymentStatus, currency: "USD" }] : items, error: null });
  } }; } }; } };
}
test("existing router primitives preserve Daju/local routing and reject malformed or unsupported binding", async () => {
  const summary = { handled: 1, fulfilled: 1, failed: 0, uncertain: 0, needsInput: 0 };
  let dajuCalls = 0;
  const local = { delivery_type: "auto_delivery", product_snapshot: { supplier_binding: null } };
  const daju = { delivery_type: "auto_delivery", product_snapshot: { supplier_binding: { supplier: "daju" } } };
  const result = await dispatchLocalPaidSuppliers({ service: service([local, daju]), orderId: "order-1",
    daju: async () => { dajuCalls += 1; return summary; } });
  assert.equal(result.fulfilled, 1);
  assert.equal(dajuCalls, 1);
  for (const supplierBinding of [{ supplier: "unknown" }, { supplier: "" }, "malformed"]) {
    await assert.rejects(dispatchLocalPaidSuppliers({ service: service([{ delivery_type: "auto_delivery",
      product_snapshot: { supplier_binding: supplierBinding } }]), orderId: "order-1" }), /SUPPLIER_/);
  }
  await assert.rejects(dispatchLocalPaidSuppliers({ service: service([daju], "unpaid"),
    orderId: "order-1", daju: async () => { dajuCalls += 1; return summary; } }), /ORDER_NOT_ELIGIBLE/);
  assert.equal(dajuCalls, 1);
});
