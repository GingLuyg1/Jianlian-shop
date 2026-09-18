import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const file = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const rechargeRoute = file("app/api/recharges/route.ts");
const sessionService = file("lib/payments/payment-session-service.ts");
const bep20Service = file("lib/payments/bep20-chain-service.ts");
const watcher = file("lib/payments/liuhaoyi-wechat-watcher.mjs");
const recovery = file("lib/payments/liuhaoyi-wechat-recovery-service.ts");
const paymentPage = file("app/payment/page.tsx");
const bep20Summary = file("components/account/orders/Bep20OrderPaymentSummary.tsx");
const migration = file("supabase/migrations/20260918120000_payment_expiry_15_minutes.sql");

test("all new recharge types use the shared 15-minute window", () => {
  assert.match(rechargeRoute, /createPaymentExpiryWindow\(\)/);
  assert.match(rechargeRoute, /const expiresAt = paymentWindow\.expiresAt/);
  assert.match(rechargeRoute, /const createdAt = paymentWindow\.createdAt/);
  assert.doesNotMatch(rechargeRoute, /20\s*\*\s*60\s*\*\s*1000/);
});

test("generic and BEP20 store sessions use shared expiry without provider extension", () => {
  assert.match(sessionService, /createPaymentExpiryWindow\(\)\.expiresAt/);
  assert.match(sessionService, /expires_at: expiresAt/);
  assert.doesNotMatch(sessionService, /expires_at:\s*providerResult\.expiresAt/);
  assert.match(bep20Service, /createPaymentExpiryWindow\(\)\.expiresAt/);
  assert.doesNotMatch(bep20Service, /BSC_PAYMENT_EXPIRE_MINUTES/);
});

test("existing persisted session expiry is reused and never recalculated", () => {
  assert.match(sessionService, /if \(reusable\)[\s\S]*?return toSessionResponse\(existing\)/);
  assert.match(sessionService, /businessType === "recharge" && business\.expiresAt\s*\? business\.expiresAt/);
});

test("order migration is insert-only, forward-only, and makes no historical data writes", () => {
  assert.match(migration, /tg_op = 'INSERT'/i);
  assert.match(migration, /interval '15 minutes'/i);
  assert.match(migration, /UPDATE never recomputes persisted expiry/i);
  assert.doesNotMatch(migration, /update\s+public\.(?:orders|payment_sessions|account_recharges)/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.(?:balance_transactions|payment_sessions|account_recharges)/i);
});

test("watcher and recovery continue using persisted expiry without extending it", () => {
  assert.match(watcher, /expires_at:\s*"gt\." \+ new Date\(nowMs\)\.toISOString\(\)/);
  assert.match(recovery, /paidAtMs <= Date\.parse\(String\(session\.expiresAt/);
  assert.match(recovery, /paidAtMs <= Date\.parse\(String\(recharge\?\.expiresAt/);
});

test("payment UI counts down from persisted expiry and renewal copy says 15 minutes", () => {
  assert.match(paymentPage, /secondsLeft\(session\?\.expiresAt/);
  assert.match(paymentPage, /secondsLeft\(recharge\?\.expiresAt/);
  assert.match(bep20Summary, /新的 15 分钟支付会话/);
  assert.doesNotMatch(bep20Summary, /新的 30 分钟支付会话/);
});
