import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("disabled channels remain eligible for existing-session callbacks without enabling new creation", () => {
  const callback = source("lib/payments/payment-callback-service.ts");
  const sessions = source("lib/payments/payment-session-service.ts");
  const callbackLoad = callback.slice(callback.indexOf("async function loadChannel"), callback.indexOf("async function findCallbackSession"));
  assert.doesNotMatch(callbackLoad, /\.eq\("enabled", true\)/);
  assert.match(callbackLoad, /public_config/);
  assert.match(sessions, /const reusable = await getReusableSession[\s\S]*const channel = await loadEnabledChannel/);
  assert.match(sessions, /loadEnabledChannel[\s\S]*\.eq\("enabled", true\)/);
});

test("callback summaries redact credentials and never log the signed request URL", () => {
  const callback = source("lib/payments/payment-callback-service.ts");
  assert.match(callback, /!\/key\|secret\|sign\|token\|password\|private\|credential\/i\.test\(key\)/);
  assert.doesNotMatch(callback, /console\.(?:log|warn|error)\([^\n]*request\.url/);
  assert.doesNotMatch(callback, /payload_summary:\s*payload/);
});

test("duplicate order callbacks retain atomic payment and fulfillment guards", () => {
  const callback = source("lib/payments/payment-callback-service.ts");
  const completion = source("lib/payments/complete-payment-service.ts");
  const core = source("supabase/migrations/20260623_payment_core_linkage.sql");
  const fulfillment = source("supabase/migrations/20260623_mixed_order_item_fulfillment.sql");
  assert.match(callback, /if \(session\.status === "paid"\)[\s\S]*"duplicate"/);
  assert.match(core, /select \* into v_session[\s\S]*for update/);
  assert.match(core, /if v_session\.status = 'paid'[\s\S]*'idempotent', true/);
  assert.match(core, /if v_order\.payment_status = 'paid'[\s\S]*'idempotent', true/);
  assert.match(completion, /await deliverDigitalOrder/);
  assert.match(fulfillment, /v_remaining := greatest\(coalesce\(v_item\.quantity, 1\) - coalesce\(v_already_delivered, 0\), 0\)/);
  assert.match(fulfillment, /'idempotent', v_delivered_total = 0/);
});

test("expired recharge and order presentations block payment actions", () => {
  const payment = source("app/payment/page.tsx");
  const sessions = source("lib/payments/payment-session-service.ts");
  assert.match(payment, /if \(expired\) return <ExpiredRechargeNotice/);
  assert.match(payment, /!\["closed", "expired", "failed"\]\.includes\(String\(order\?\.status/);
  assert.match(payment, /if \(createStarted\.current \|\| completed \|\| expired\)/);
  assert.match(sessions, /\["cancelled", "closed", "expired", "refunded", "failed"\]\.includes\(record\.status\)/);
  assert.match(sessions, /normalizeSessionStatus\(latest\.status\) === "expired" \|\| isExpiredAt\(latest\.expires_at\)/);
  assert.match(payment, /sessionPaymentBlocked[\s\S]*不能继续扫码、打开付款入口或创建替代支付单/);
  assert.match(source("lib/payments/payment-callback-service.ts"), /CALLBACK_RECHARGE_PAID_AFTER_EXPIRY/);
});

test("local principal remains unchanged by the provider-side three-percent notice", () => {
  const provider = source("lib/payments/providers/liuhaoyi.ts");
  const recharge = source("app/api/recharges/route.ts");
  assert.match(provider, /money = assertLiuhaoyiAmountBreakdown\(input\.requestedAmount, input\.feeAmount, input\.payableAmount\)/);
  assert.match(recharge, /summary\.fee !== 0 \|\| summary\.payableAmount !== summary\.amount/);
  assert.doesNotMatch(provider, /1\.03|0\.03|\*\s*103/);
});

test("return-page reentry only reads status and never completes payment", () => {
  const payment = source("app/payment/page.tsx");
  assert.doesNotMatch(payment, /completePayment|complete_account_recharge|credit_account_recharge_balance/);
  assert.doesNotMatch(payment, /window\.location\.assign/);
  assert.match(payment, /api\/payments\/status/);
});
