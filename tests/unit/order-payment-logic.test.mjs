import test from "node:test";
import assert from "node:assert/strict";
import {
  applyRechargeCallback,
  assertSandboxProviderAllowed,
  calculateOrderTotal,
  channelCapability,
  createIdempotencyStore,
  evaluateProviderConfig,
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

test("evaluates provider configuration without exposing secret values", () => {
  const missing = evaluateProviderConfig("generic_api", {});
  const partial = evaluateProviderConfig("generic_api", {
    GENERIC_PAYMENT_API_BASE_URL: "https://sandbox.example.test",
  });
  const pending = evaluateProviderConfig("generic_api", {
    GENERIC_PAYMENT_API_BASE_URL: "https://sandbox.example.test",
    GENERIC_PAYMENT_MERCHANT_ID: "merchant",
    GENERIC_PAYMENT_API_SECRET: "secret",
  });
  const connected = evaluateProviderConfig(
    "generic_api",
    {
      GENERIC_PAYMENT_API_BASE_URL: "https://sandbox.example.test",
      GENERIC_PAYMENT_MERCHANT_ID: "merchant",
      GENERIC_PAYMENT_API_SECRET: "secret",
    },
    true,
  );

  assert.equal(missing.status, "not_configured");
  assert.equal(partial.status, "partially_configured");
  assert.equal(pending.status, "pending_verification");
  assert.equal(connected.status, "connected");
  assert.deepEqual(pending.missing, []);
});

test("declares channel capabilities without front-end guessing", () => {
  const alipay = channelCapability("generic_api", "alipay");
  const trc20 = channelCapability("crypto_address", "usdt_trc20");

  assert.equal(alipay.supportsQrCode, true);
  assert.equal(alipay.supportsWalletAddress, false);
  assert.equal(trc20.supportsWalletAddress, true);
  assert.equal(trc20.supportsQrCode, false);
});

test("sandbox provider is blocked outside test or explicit sandbox mode", () => {
  assert.equal(assertSandboxProviderAllowed({ NODE_ENV: "test" }), true);
  assert.equal(assertSandboxProviderAllowed({ PAYMENT_PROVIDER_MODE: "sandbox" }), true);
  assert.throws(() => assertSandboxProviderAllowed({ NODE_ENV: "production" }), /disabled/);
});
