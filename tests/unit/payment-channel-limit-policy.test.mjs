import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ONLINE_CNY_MAXIMUM,
  isOnlineCnyOverLimit,
} from "../../lib/payments/online-payment-policy.mjs";

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("Alipay and WeChat use the 1000 CNY online ceiling", () => {
  assert.equal(ONLINE_CNY_MAXIMUM, 1000);
  assert.equal(isOnlineCnyOverLimit("1000.00"), false);
  assert.equal(isOnlineCnyOverLimit("1000.01"), true);

  const providers = source("lib/payments/providers.ts");
  assert.equal((providers.match(/maximumAmount: 1000,/g) ?? []).length >= 2, true);
});

test("USDT account recharge has no maximum ceiling", () => {
  const route = source("app/api/recharges/route.ts");
  const channelsRoute = source("app/api/recharges/channels/route.ts");
  const ui = source("components/account/AccountRechargeContent.tsx");

  assert.match(route, /!isUsdtCnyRecharge && currency === "CNY" && isOnlineCnyOverLimit\(body\.amount\)/);
  assert.match(channelsRoute, /channel\.code === "usdt_bep20"[\s\S]*\? undefined/);
  assert.match(route, /classifyExactRange\(theoreticalUsdtAmount, channel\.minimumAmount, 0\)/);
  assert.match(route, /p_maximum_usdt: 0/);
  assert.doesNotMatch(ui, /compareRechargeDecimals\(requestedCnyAmount, "2000"\)/);
  assert.match(ui, /USDT BEP20 不设最高金额/);
});

test("USDT checkout and BEP20 service bypass the fiat ceiling", () => {
  const checkout = source("app/checkout/page.tsx");
  const orders = source("app/api/orders/route.ts");
  const bep20 = source("lib/payments/bep20-chain-service.ts");

  assert.match(checkout, /selectedPaymentChannel\?\.currency === "CNY"/);
  assert.doesNotMatch(checkout, /paymentMethod !== "balance" && orderAmount > 2000/);
  assert.match(orders, /paymentMethod !== "usdt_bep20" && isOnlineCnyOverLimit\(payableAmount\)/);
  assert.doesNotMatch(bep20, /isOnlineCnyOverLimit|ONLINE_PAYMENT_LIMIT_MESSAGE/);
});
