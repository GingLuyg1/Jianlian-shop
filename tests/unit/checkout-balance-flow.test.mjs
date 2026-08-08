import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyCheckoutOrderResponse,
  createCheckoutSubmissionGuard,
  evaluateCheckoutBalance,
  formatCnyFromCents,
  getBalanceSubmissionBlockReason,
  parseAccountAssetsBalance,
} from "../../lib/checkout/balance-flow.mjs";

test("checkout balance allows a balance greater than the order amount", () => {
  const result = evaluateCheckoutBalance(27, 30);
  assert.deepEqual(result, {
    kind: "ready",
    sufficient: true,
    orderCents: 2700,
    balanceCents: 3000,
    remainingCents: 300,
    shortfallCents: 0,
    orderAmount: 27,
    availableBalance: 30,
    remainingAmount: 3,
    shortfallAmount: 0,
  });
});

test("checkout balance allows an exact balance and shows zero remaining", () => {
  const result = evaluateCheckoutBalance(27, 27);
  assert.equal(result.kind, "ready");
  assert.equal(result.sufficient, true);
  assert.equal(result.remainingCents, 0);
});

test("checkout balance reports the exact shortfall when balance is lower", () => {
  const result = evaluateCheckoutBalance(27, 10);
  assert.equal(result.kind, "ready");
  assert.equal(result.sufficient, false);
  assert.equal(result.shortfallCents, 1700);
  assert.equal(formatCnyFromCents(result.shortfallCents), "17.00");
});

test("zero balance is insufficient without producing a negative amount", () => {
  const result = evaluateCheckoutBalance(27, 0);
  assert.equal(result.kind, "ready");
  assert.equal(result.sufficient, false);
  assert.equal(result.shortfallCents, 2700);
  assert.equal(result.remainingCents, 0);
});

test("a later account-assets refresh replaces the earlier checkout balance", () => {
  const before = parseAccountAssetsBalance({ summary: { availableBalance: 10 }, diagnostics: { profileError: null } });
  const after = parseAccountAssetsBalance({ summary: { availableBalance: 30 }, diagnostics: { profileError: null } });
  assert.equal(before.kind, "ready");
  assert.equal(after.kind, "ready");
  assert.equal(evaluateCheckoutBalance(27, before.balance).sufficient, false);
  assert.equal(evaluateCheckoutBalance(27, after.balance).sufficient, true);
});

test("profile diagnostics and malformed balances fail closed", () => {
  assert.equal(parseAccountAssetsBalance({ summary: { availableBalance: 99 }, diagnostics: { profileError: "unavailable" } }).kind, "unavailable");
  assert.equal(parseAccountAssetsBalance({ summary: { availableBalance: "99" } }).kind, "unavailable");
  assert.equal(parseAccountAssetsBalance({ summary: { availableBalance: -1 } }).kind, "unavailable");
});

test("insufficient or unconfirmed balance blocks order creation before fetch", async () => {
  let createCalls = 0;
  const attempt = async (balanceStatus, balanceSummary) => {
    const reason = getBalanceSubmissionBlockReason({ paymentMethod: "balance", balanceStatus, balanceSummary });
    if (reason) return reason;
    createCalls += 1;
    return null;
  };

  assert.equal(await attempt("ready", evaluateCheckoutBalance(27, 10)), "BALANCE_INSUFFICIENT");
  assert.equal(await attempt("loading", evaluateCheckoutBalance(27, 30)), "BALANCE_LOADING");
  assert.equal(createCalls, 0);
  assert.equal(await attempt("ready", evaluateCheckoutBalance(27, 30)), null);
  assert.equal(createCalls, 1);
});

test("balance availability does not gate the existing BEP20 payment choice", () => {
  const reason = getBalanceSubmissionBlockReason({
    paymentMethod: "usdt_bep20",
    balanceStatus: "error",
    balanceSummary: { kind: "unavailable" },
  });
  assert.equal(reason, null);
});

test("a server 402 preserves the existing order and request identity", () => {
  const result = classifyCheckoutOrderResponse(402, {
    code: "BALANCE_PAYMENT_FAILED",
    request_id: "request-1",
    order: { order_no: "ORD-1001" },
  });
  assert.deepEqual(result, {
    kind: "balance_insufficient_existing_order",
    orderNo: "ORD-1001",
    requestId: "request-1",
  });
});

test("repeating the same 402 classification never invents a second order", () => {
  const payload = { request_id: "request-1", order: { order_no: "ORD-1001" } };
  const first = classifyCheckoutOrderResponse(402, payload);
  const second = classifyCheckoutOrderResponse(402, payload);
  assert.equal(first.orderNo, second.orderNo);
  assert.equal(first.requestId, second.requestId);
});

test("the single-flight guard rejects duplicate checkout clicks", () => {
  const guard = createCheckoutSubmissionGuard();
  assert.equal(guard.tryStart(), true);
  assert.equal(guard.tryStart(), false);
  assert.equal(guard.isActive(), true);
  guard.finish();
  assert.equal(guard.tryStart(), true);
});

test("CNY display rounds once to cents and always renders two decimals", () => {
  const result = evaluateCheckoutBalance(0.1 + 0.2, 1.005);
  assert.equal(result.kind, "ready");
  assert.equal(result.orderCents, 30);
  assert.equal(result.balanceCents, 101);
  assert.equal(formatCnyFromCents(result.orderCents), "0.30");
  assert.equal(formatCnyFromCents(result.balanceCents), "1.01");
});
