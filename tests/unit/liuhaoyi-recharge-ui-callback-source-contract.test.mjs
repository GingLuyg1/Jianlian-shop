import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rechargeUi = readFileSync(new URL("../../components/account/AccountRechargeContent.tsx", import.meta.url), "utf8");
const paymentPage = readFileSync(new URL("../../app/payment/page.tsx", import.meta.url), "utf8");
const rechargeRoute = readFileSync(new URL("../../app/api/recharges/route.ts", import.meta.url), "utf8");
const callbackService = readFileSync(new URL("../../lib/payments/payment-callback-service.ts", import.meta.url), "utf8");
const provider = readFileSync(new URL("../../lib/payments/providers/liuhaoyi.ts", import.meta.url), "utf8");

test("UI explains the provider 3 percent charge without adding it to local amounts", () => {
  assert.match(rechargeUi, /额外收取 3% 支付通道手续费/);
  assert.match(paymentPage, /额外收取 3% 支付通道手续费/);
  assert.match(rechargeRoute, /summary\.fee !== 0 \|\| summary\.payableAmount !== summary\.amount/);
  assert.match(provider, /assertLiuhaoyiAmountBreakdown\(input\.requestedAmount, input\.feeAmount, input\.payableAmount\)/);
  assert.doesNotMatch(provider, /\*\s*1\.03|1\.03\s*\*/);
});

test("Alipay and WeChat recharge requests preserve the normalized decimal string payload", () => {
  assert.match(
    rechargeUi,
    /amount:\s*isUsdtCnyRecharge\s*\?\s*requestedCnyAmount\s*:\s*amountText/,
  );
  assert.doesNotMatch(
    rechargeUi,
    /amount:\s*isUsdtCnyRecharge\s*\?\s*requestedCnyAmount\s*:\s*summary\?\.amount/,
  );
  assert.match(rechargeRoute, /parsePublicRechargeAmount\(body\.amount, 6\)/);
});

test("recharge history exposes order number, countdown, continue payment and customer service", () => {
  assert.match(rechargeUi, /资金充值记录/);
  assert.doesNotMatch(rechargeUi, /资金变动记录/);
  assert.match(rechargeUi, /待支付剩余时间/);
  assert.match(rechargeUi, /继续支付/);
  assert.match(rechargeUi, /订单编号/);
  assert.match(rechargeUi, /openPublicSupport/);
});

test("late paid callback preserves evidence and routes to manual reconciliation before completion", () => {
  const lateGuard = callbackService.indexOf("isExpiredRechargePayment");
  const completion = callbackService.indexOf("const completion = await completePayment");
  assert.ok(lateGuard >= 0 && completion > lateGuard);
  assert.match(callbackService, /provider_paid_local_unpaid/);
  assert.match(callbackService, /provider_transaction_id: providerTransactionId/);
  assert.match(callbackService, /provider_trade_no: providerTransactionId/);
  assert.match(callbackService, /CALLBACK_RECHARGE_PAID_AFTER_EXPIRY/);
  assert.doesNotMatch(callbackService, /forceCredit|forcePaid|refundPayment/);
});

test("USDT V3 retains its existing independent 20 minute fingerprint window", () => {
  assert.match(rechargeRoute, /isUsdtCnyRecharge[\s\S]*Date\.now\(\) \+ 20 \* 60 \* 1000/);
});
