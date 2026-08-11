import assert from "node:assert/strict";
import test from "node:test";

import { classifyBalancePaymentFailure } from "../../lib/orders/balance-payment-failure.mjs";

test("the explicit RPC insufficient-balance contract maps to a safe 402", () => {
  assert.deepEqual(classifyBalancePaymentFailure({ code: "P0001", message: "账户余额不足" }), {
    status: 402,
    code: "BALANCE_INSUFFICIENT",
    message: "账户余额不足，请充值后继续支付原订单。",
  });
});

test("a PostgREST-style Error subclass keeps the explicit insufficient-balance contract", () => {
  const error = new Error("账户余额不足");
  error.code = "P0001";
  assert.equal(classifyBalancePaymentFailure(error).code, "BALANCE_INSUFFICIENT");
});

test("missing RPC, schema cache, and database failures do not masquerade as insufficient balance", () => {
  const failures = [
    { code: "PGRST202", message: "Could not find the function public.pay_order_with_balance in the schema cache" },
    { code: "PGRST205", message: "schema cache unavailable" },
    { code: "XX000", message: "internal database details" },
    new Error("network failed"),
  ];

  for (const failure of failures) {
    assert.deepEqual(classifyBalancePaymentFailure(failure), {
      status: 503,
      code: "BALANCE_PAYMENT_UNAVAILABLE",
      message: "余额支付服务暂时不可用，原订单已保留，请稍后重试。",
    });
  }
});

test("an insufficient-looking message without the RPC error code fails closed", () => {
  assert.equal(classifyBalancePaymentFailure({ code: "XX000", message: "账户余额不足" }).code, "BALANCE_PAYMENT_UNAVAILABLE");
});
