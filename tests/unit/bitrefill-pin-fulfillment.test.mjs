import assert from "node:assert/strict";
import test from "node:test";
import { pinFixture, PinFakeTransport } from "../support/bitrefill-pin-fixture.mjs";
import { prepareBitrefillPinPurchase, assertPreparedPinPurchase } from "../../lib/providers/bitrefill/pin-policy.mjs";
import { createBitrefillPinFulfillment, evaluateBitrefillPinStock } from "../../lib/providers/bitrefill/pin-fulfillment.mjs";
import { BitrefillPurchaseHttpTransport } from "../../lib/providers/bitrefill/purchase-http-transport.mjs";
for (const face of ["10", "15", "20"]) test(`GBP${face} PIN freezes GBP face, USD debit and CNY paid evidence separately`, () => {
  const f = pinFixture(face), t = new PinFakeTransport(f), p = prepareBitrefillPinPurchase({ transport: t, ...f });
  assert.equal(p.item.binding.currency, "GBP");assert.equal(p.item.binding.faceValue, face);
  assert.equal(p.semanticContext.costCurrency, "USD");assert.equal(p.semanticContext.paidCny, f.financial.paidItemAmount);
  assertPreparedPinPurchase(p, t);assert.throws(() => assertPreparedPinPurchase(structuredClone(p), t), /TOKEN_REQUIRED/);
});
for (const [name, change] of [
  ["phone product", f => f.pricing.catalogRaw.recipient_type = "phone_number"],
  ["unpaid", f => f.candidate.order.payment_status = "unpaid"],
  ["unpaid ledger", f => f.financial.paymentState = "processing"],
  ["refund", f => f.financial.refundState = "pending"],
  ["no fees", f => f.pricing.quote.feesIncluded = false],
  ["wrong package", f => f.pricing.quote.packageId = "wrong"],
  ["wrong country", f => f.pricing.catalogRaw.country_code = "US"],
  ["wrong account", f => f.balance.accountFingerprint = "b".repeat(64)],
  ["missing cost currency", f => delete f.candidate.orderItem.product_snapshot.supplier_binding.supplier_cost_currency],
  ["stock unavailable", f => f.pricing.catalogRaw.in_stock = false],
  ["cost rise", f => f.pricing.quote.allInUsd = "30"],
  ["margin below 15", f => { f.financial.paidItemAmount = "90";f.candidate.orderItem.unit_price = "90"; }],
  ["insufficient balance", f => f.balance.availableAmount = "1"],
  ["expired quote", f => f.pricing.quote.expiresAt = new Date(Date.now() - 1).toISOString()],
  ["stale FX", f => f.financial.fx.expiresAt = new Date(Date.now() - 1).toISOString()],
  ["minimum frozen profit", f => f.candidate.orderItem.product_snapshot.supplier_binding.supplier_min_unit_profit = "100"],
]) test(`PIN rejects ${name} before durable claim or external call`, () => {
  const f = pinFixture();change(f);const t = new PinFakeTransport(f);
  assert.throws(() => prepareBitrefillPinPurchase({ transport: t, ...f }));assert.equal(t.invoiceSubmissions, 0);
});
test("personal and Business HTTP dependencies cannot be enabled with constructor flags", () => {
  for (const credentials of [{ authMode: "personal", apiKey: "synthetic-only" }, { authMode: "business", apiId: "synthetic", apiSecret: "synthetic-only" }]) {
    let calls = 0;const transport = new BitrefillPurchaseHttpTransport({ ...credentials, purchaseEnabled: true, fetchImpl: () => { calls++;throw Error("NO_NETWORK"); } });
    assert.throws(() => createBitrefillPinFulfillment({ transport }), /REAL_PURCHASE_DISABLED/);assert.equal(calls, 0);
  }
});
test("supplier stock remains boolean/null; local inventory wins without fake quantities", () => {
  const nowMs = Date.now();const supplierSnapshot = { checked_at: new Date(nowMs).toISOString(), available: true,
    supplier_quantity_known: false, quantity: null, freshness: { supplier_stock_stale: false, supplier_stock_sync_status: "synced" } };
  assert.deepEqual(evaluateBitrefillPinStock({ localStock: 2, nowMs, maxAgeMs: 60000 }), { source: "local", quantity: 2, purchasable: true });
  const result = evaluateBitrefillPinStock({ localStock: 0, supplierSnapshot, nowMs, maxAgeMs: 60000, saleDecision: { canAcceptPayment: true } });
  assert.equal(result.quantity, null);assert.equal(result.quantityKnown, false);assert.equal(result.available, true);assert.equal(result.purchasable, false);
  assert.equal(evaluateBitrefillPinStock({ localStock: 0, supplierSnapshot, nowMs, maxAgeMs: 60000, saleDecision: { canAcceptPayment: false } }).purchasable, false);
  assert.equal(evaluateBitrefillPinStock({ localStock: 0, supplierSnapshot, nowMs: nowMs + 60001, maxAgeMs: 60000, saleDecision: { canAcceptPayment: true } }).purchasable, false);
});
