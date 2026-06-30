import test from "node:test";
import assert from "node:assert/strict";
import {
  applyRechargeCallback,
  calculateOrderTotal,
  createIdempotencyStore,
  formatMinorUnits,
  toMinorUnits,
  validatePaymentCallback,
} from "./helpers/order-payment-logic.mjs";

test("calculates order total from server prices and ignores client prices", () => {
  const total = calculateOrderTotal([
    { serverUnitPrice: "69.00", clientUnitPrice: "0.01", quantity: 2 },
    { serverUnitPrice: "31.00", clientUnitPrice: "0.01", quantity: 1 },
  ]);

  assert.equal(formatMinorUnits(total), "169.00");
});

test("rejects invalid quantity and over-precise money", () => {
  assert.throws(() => calculateOrderTotal([{ serverUnitPrice: "1.00", quantity: 0 }]), /正整数/);
  assert.throws(() => toMinorUnits("1.001", 2), /小数位/);
});

test("uses client_request_id idempotency to return one order", () => {
  const store = createIdempotencyStore();
  const first = store.resolve("user_1:req_1", () => ({ orderNo: "JL001" }));
  const second = store.resolve("user_1:req_1", () => ({ orderNo: "JL002" }));

  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(second.value.orderNo, "JL001");
  assert.equal(store.size, 1);
});

test("rejects payment callback when provider is not configured", () => {
  const result = validatePaymentCallback(
    { providerConfigured: false, status: "pending", currency: "CNY", payableAmount: "100.00" },
    { currency: "CNY", amount: "100.00", signatureValid: true },
  );

  assert.equal(result.ok, false);
  assert.match(result.reason, /暂未配置/);
});

test("rejects payment callback amount and currency mismatch", () => {
  const session = { providerConfigured: true, status: "pending", currency: "CNY", payableAmount: "100.00" };

  assert.equal(
    validatePaymentCallback(session, { currency: "USD", amount: "100.00", signatureValid: true }).ok,
    false,
  );
  assert.equal(
    validatePaymentCallback(session, { currency: "CNY", amount: "99.00", signatureValid: true }).ok,
    false,
  );
});

test("applies recharge callback exactly once", () => {
  const state = {
    session: {
      providerConfigured: true,
      status: "pending",
      currency: "CNY",
      payableAmount: "100.00",
      creditedAmount: "100.00",
    },
    balanceMinor: 0n,
    ledgerCount: 0,
    processedCallbackIds: new Set(),
  };

  const callback = { callbackId: "cb_1", currency: "CNY", amount: "100.00", signatureValid: true };
  const paid = applyRechargeCallback(state, callback);
  const duplicate = applyRechargeCallback(paid, callback);

  assert.equal(paid.accepted, true);
  assert.equal(formatMinorUnits(paid.balanceMinor), "100.00");
  assert.equal(paid.ledgerCount, 1);
  assert.equal(duplicate.duplicate, true);
  assert.equal(formatMinorUnits(duplicate.balanceMinor), "100.00");
  assert.equal(duplicate.ledgerCount, 1);
});
