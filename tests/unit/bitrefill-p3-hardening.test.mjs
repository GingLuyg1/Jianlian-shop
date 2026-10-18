import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBitrefillSyntheticQuote, decimalMicros, assertSyntheticBalance } from "../../lib/providers/bitrefill/quote-core.mjs";
import { assertLocalPaymentEligibility, validateLocalFinancialEvidence } from "../../lib/providers/bitrefill/paid-order-local.mjs";
import { REAL_BITREFILL_PURCHASE_ENABLED } from "../../lib/providers/bitrefill/prelaunch-policy.mjs";
import { BitrefillPurchaseHttpTransport } from "../../lib/providers/bitrefill/purchase-http-transport.mjs";
import { reconcileBitrefillSingleItem } from "../../lib/providers/bitrefill/single-item-purchase.mjs";
import { BitrefillFakeTransport } from "../../lib/providers/bitrefill/transport.mjs";
import { runBitrefillSingleItemPurchase } from "../../lib/providers/bitrefill/purchase-persistence.mjs";

const nowMs = Date.parse("2026-10-16T00:00:00Z");
const quote = { supplier: "bitrefill", productId: "synthetic-card", packageId: "synthetic-5",
  quantity: 1, amount: "4.80", currency: "USD", source: "synthetic_fixture", synthetic: true,
  checkedAt: new Date(nowMs).toISOString(), expiresAt: new Date(nowMs + 240_000).toISOString(),
  maxAllowedSpend: "5.00" };
test("quote normalization requires exact synthetic identity, source, expiry and spend ceiling", () => {
  assert.equal(normalizeBitrefillSyntheticQuote(quote, { nowMs }).quantity, 1);
  for (const change of [{ synthetic: false }, { supplier: "daju" }, { quantity: 2 },
    { source: "face_value" }, { amount: 4.8 }, { amount: "4.8000001" }, { amount: "1e3" },
    { currency: "usd" }, { productId: 12 }, { amount: "5.01" }, { maxAllowedSpend: "0" },
    { expiresAt: new Date(nowMs).toISOString() }, { expiresAt: new Date(nowMs + 600_000).toISOString() },
    { checkedAt: new Date(nowMs + 1).toISOString() }, { checkedAt: "invalid" }]) {
    assert.throws(() => normalizeBitrefillSyntheticQuote({ ...quote, ...change }, { nowMs }), /BITREFILL_/);
  }
  assert.equal(decimalMicros("999999999999.999999"), 999999999999999999n);
  assert.equal(decimalMicros("0.100001") - decimalMicros("0.100000"), 1n);
});

test("balance unknown, insufficient, currency mismatch and timeout never authorize submit", () => {
  assertSyntheticBalance({ source: "synthetic_balance", state: "sufficient", currency: "USD", availableAmount: "4.80" }, quote);
  for (const change of [{ state: "unknown" }, { state: "timeout" }, { state: "insufficient" },
    { currency: "CNY" }, { availableAmount: "4.799999" }, { source: "browser" }]) {
    assert.throws(() => assertSyntheticBalance({ source: "synthetic_balance", state: "sufficient",
      currency: "USD", availableAmount: "5.00", ...change }, quote), /BITREFILL_/);
  }
});

test("refund, dispute, failed and processing payment evidence remain blocked", () => {
  const evidence = { source: "synthetic_paid_ledger", paymentState: "paid", refundState: "none", disputeState: "none" };
  assertLocalPaymentEligibility(evidence);
  for (const change of [{ paymentState: "unpaid" }, { paymentState: "failed" }, { paymentState: "processing" },
    { refundState: "pending" }, { disputeState: "open" }, { source: "frontend_paid" }]) {
    assert.throws(() => assertLocalPaymentEligibility({ ...evidence, ...change }), /PAYMENT_RISK/);
  }
});

test("release gate cannot be opened by constructor opt-in and never calls POST fetch", async () => {
  assert.equal(REAL_BITREFILL_PURCHASE_ENABLED, false);
  let calls = 0;
  const transport = new BitrefillPurchaseHttpTransport({ authMode: "personal", apiKey: "SYNTHETIC_ONLY",
    purchaseEnabled: true, fetchImpl: async () => { calls += 1; throw new Error("NETWORK_FORBIDDEN"); } });
  assert.equal(transport.purchaseEnabled, false);
  await assert.rejects(transport.createInvoice({ products: [{ product_id: "synthetic-card", package_id: "synthetic-5", quantity: 1 }] }), /REAL_PURCHASE_DISABLED/);
  assert.equal(calls, 0);
  let claims = 0;
  await assert.rejects(runBitrefillSingleItemPurchase({ transport,
    db: { claim: async () => { claims += 1; } } }), /REAL_PURCHASE_DISABLED/);
  assert.equal(claims, 0);
});

test("explicit other fees preserve six-decimal minimum-profit boundary", () => {
  const candidate = { order: { id: "order", currency: "USD" }, orderItem: {
    id: "item", unit_price: "6.00", product_snapshot: { supplier_binding: { supplier_min_unit_profit: "1.00" } } } };
  const evidence = { source: "synthetic_paid_ledger", orderId: "order", orderItemId: "item",
    currency: "USD", paidItemAmount: "6.00", paymentFee: "0.10", otherFees: "0.10",
    maxUnitProfit: "2.00", fxSource: "same_currency_no_conversion",
    paymentState: "paid", refundState: "none", disputeState: "none" };
  assert.equal(validateLocalFinancialEvidence(candidate,evidence,quote).otherFees,"0.10");
  for (const otherFees of ["0.100001", "6.00", "-0.01", 0, undefined]) {
    assert.throws(() => validateLocalFinancialEvidence(candidate,{ ...evidence,otherFees },quote), /BITREFILL_/);
  }
});

test("quote expiring after claim blocks fake submit and remains nonretryable UNCERTAIN", async () => {
  const candidate = { order: { id: "order", status: "paid", payment_status: "paid", currency: "USD" },
    orderItem: { id: "item", order_id: "order", quantity: 1, delivery_type: "auto_delivery",
      unit_price: "6.00", delivery_status: "pending", product_snapshot: { supplier_binding: {
        fulfillment_source: "supplier", supplier: "bitrefill", supplier_product_id: "synthetic-card",
        supplier_sku: "synthetic-5", supplier_currency: "USD", supplier_face_value: "5.00",
        supplier_max_unit_cost: "5.00", supplier_min_unit_profit: "1.00" } } },
    root: { id: "root", order_id: "order", order_item_id: "item", supplier: "bitrefill",
      supplier_product_id: "synthetic-card", supplier_sku: "synthetic-5", status: "PURCHASING", attempt_token: "token" } };
  let status = "CLAIMED"; let hash;
  const db = { claim: async (_supplier,_key,value) => { hash = value; return { result: "CLAIMED",attempt_id: "attempt" }; },
    getAttempt: async () => ({ status,semantic_request_hash: hash }),
    transition: async (_id,expected,next) => { assert.equal(expected,status); status = next; return { result: "TRANSITIONED" }; } };
  const fake = new BitrefillFakeTransport();
  const inputs = { db,transport: fake,candidate,quote,nowMs,
    productCheckedAt: quote.checkedAt,product: { provider: "bitrefill",external_product_id: "synthetic-card",
      currency: "USD",availability: "available",fixed_packages: [{ package_id: "synthetic-5",face_value: "5.00",currency: "USD" }] },
    beforeSubmit: async () => normalizeBitrefillSyntheticQuote(quote,{ nowMs: nowMs+240_000 }) };
  assert.equal((await runBitrefillSingleItemPurchase(inputs)).status,"UNCERTAIN");
  assert.equal((await runBitrefillSingleItemPurchase(inputs)).submitted,false);
  assert.equal(fake.invoiceSubmissions,0);
});

for (const scenario of ["missing_id", "multiple", "duplicate", "wrong_product", "wrong_quantity",
  "wrong_invoice", "wrong_currency", "wrong_status", "unknown_schema", "instructions_only", "pin_only", "unsafe_url"]) {
  test(`child fail closed: ${scenario}`, async () => {
    const invoice = { id: "synthetic-invoice", status: "complete", orders: [{ id: "synthetic-child", status: "delivered" }] };
    const order = { id: "synthetic-child", status: "delivered", quantity: 1,
      product: { id: "synthetic-card", value: 5, currency: "USD" }, redemption_info: { code: "SYNTHETIC_CARD" } };
    if (scenario === "missing_id") delete invoice.orders[0].id;
    if (scenario === "multiple") invoice.orders.push({ id: "other-child", status: "delivered" });
    if (scenario === "duplicate") invoice.orders.push({ ...invoice.orders[0] });
    if (scenario === "wrong_product") order.product.id = "other-card";
    if (scenario === "wrong_quantity") order.quantity = 2;
    if (scenario === "wrong_invoice") order.invoice_id = "other-invoice";
    if (scenario === "wrong_currency") order.product.currency = "CAD";
    if (scenario === "wrong_status") order.status = "unexpected";
    if (scenario === "unknown_schema") delete invoice.orders;
    if (scenario === "instructions_only") order.redemption_info = { instructions: "not a card" };
    if (scenario === "pin_only") order.redemption_info = { pin: "SYNTHETIC_PIN" };
    if (scenario === "unsafe_url") order.redemption_info = { link: "http://localhost/card" };
    const db = { getAttempt: async () => ({ external_invoice_id: invoice.id, status: "EXTERNAL_CREATED" }),
      getAttemptItems: async () => [{ id: "unit", order_item_id: "item", unit_index: 1,
        frozen_product_id: "synthetic-card", frozen_face_value: "5", frozen_currency: "USD" }],
      recordChild: async () => ({ external_order_row_id: "child-row" }), recordEvidence: async () => {} };
    const transport = new BitrefillFakeTransport({ invoice, orders: { "synthetic-child": order } });
    try {
      const result = await reconcileBitrefillSingleItem({ db, transport, attemptId: "attempt" });
      assert.equal(result.deliveryCandidates.length, 0);
    } catch (error) { assert.match(error.message, /BITREFILL_/); }
  });
}
