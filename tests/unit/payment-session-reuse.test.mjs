import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isReusablePaymentSession } from "../../lib/payments/payment-session-reuse.mjs";

const now = new Date("2026-09-17T00:00:00.000Z");
const identity = {
  businessType: "recharge",
  businessId: "recharge-id",
  businessNo: "RC-1",
  userId: "user-1",
  channelCode: "wechat",
  provider: "liuhaoyi",
};
const session = {
  business_type: "recharge",
  business_id: "recharge-id",
  business_no: "RC-1",
  user_id: "user-1",
  channel_code: "wechat",
  provider: "liuhaoyi",
  status: "pending",
  expires_at: "2026-09-17T00:30:00.000Z",
};

test("an active exact-identity session is reusable after its channel is disabled", () => {
  assert.equal(isReusablePaymentSession(session, identity, now), true);
  assert.equal(isReusablePaymentSession({ ...session, status: "processing" }, identity, now), true);
});

test("expired, paid, cross-user, cross-business, cross-channel and cross-provider sessions are never reused", () => {
  for (const changed of [
    { expires_at: "2026-09-17T00:00:00.000Z" },
    { status: "paid" },
    { user_id: "user-2" },
    { business_no: "RC-2" },
    { business_id: "recharge-id-2" },
    { channel_code: "alipay" },
    { provider: "another-provider" },
  ]) {
    assert.equal(isReusablePaymentSession({ ...session, ...changed }, identity, now), false);
  }
});

test("create flow checks exact existing session before enabled channel, while new sessions retain enabled gate", () => {
  const source = readFileSync(new URL("../../lib/payments/payment-session-service.ts", import.meta.url), "utf8");
  const reuse = source.indexOf("const reusable = await getReusableSession");
  const enabled = source.indexOf("const channel = await loadEnabledChannel");
  assert.ok(reuse >= 0 && enabled > reuse);
  assert.match(source, /\.eq\("business_no", identity\.business\.businessNo\)/);
  assert.match(source, /\.eq\("user_id", identity\.business\.userId\)/);
  assert.match(source, /\.eq\("channel_code", identity\.channelCode\)/);
  assert.match(source, /\.eq\("enabled", true\)/);
  assert.match(source, /assertReusableSessionMatches\(existing/);
  assert.match(source, /const latest = await getLatestMatchingSession[\s\S]*SESSION_EXPIRED/);
  assert.match(source, /原支付会话已过期，不能创建替代支付单/);
});

test("concurrent reservation reuses only the one active business session", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/20260623_payment_core_linkage.sql", import.meta.url), "utf8");
  assert.match(migration, /create unique index if not exists payment_sessions_active_business_unique[\s\S]*business_type, business_id[\s\S]*status in \('pending', 'processing'\)/);
  assert.match(migration, /exception when unique_violation[\s\S]*status in \('pending', 'processing'\)/);
});
