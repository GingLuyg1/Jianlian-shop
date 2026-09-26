import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  evaluateLiuhaoyiAlipayRechargeRecovery,
  isExplicitLiuhaoyiRecoveryExecution,
  LIUHAOYI_ALIPAY_RECHARGE_RECOVERY_MODE,
  liuhaoyiPaidTimeMs,
} from "../../lib/payments/liuhaoyi-recovery-policy.mjs";
import { runLiuhaoyiAlipayRecoveryWorker } from "../../scripts/ops/liuhaoyi-alipay-recharge-recovery.mjs";

const nowMs = Date.parse("2026-09-15T10:25:00+08:00");
function candidate(overrides = {}) {
  return {
    session: {
      provider: "liuhaoyi", businessType: "recharge", businessId: "recharge-id",
      businessNo: "RC-ALI-1", userId: "user-1", channelCode: "alipay",
      localStatus: "pending", expiresAt: "2026-09-15T10:20:00+08:00",
      createdAt: "2026-09-15T09:58:59+08:00", currency: "CNY", localAmount: 1,
      sessionNo: "PS-RECOVERY-1", providerOrderNo: "LHY-TRADE-1", localTradeNo: null,
      ...overrides.session,
    },
    recharge: overrides.recharge === null ? null : {
      id: "recharge-id", rechargeNo: "RC-ALI-1", userId: "user-1", status: "pending",
      createdAt: "2026-09-15T09:58:59+08:00", expiresAt: "2026-09-15T10:20:00+08:00",
      creditedAmount: 0, completedAt: null,
      ...overrides.recharge,
    },
    provider: {
      found: true, status: "paid", currency: "CNY", amount: "1.00", type: "alipay",
      tradeNo: "LHY-TRADE-1", outTradeNo: "PS-RECOVERY-1", endtime: "2026-09-15 10:19:59",
      ...overrides.provider,
    },
    ledgerCount: overrides.ledgerCount ?? 0,
    nowMs: overrides.nowMs ?? nowMs,
  };
}
const decision = (overrides = {}) => evaluateLiuhaoyiAlipayRechargeRecovery(candidate(overrides));

test("execution requires literal true and recovery mode remains Alipay account recharge", () => {
  assert.equal(LIUHAOYI_ALIPAY_RECHARGE_RECOVERY_MODE, "alipay_account_recharge_v1");
  for (const value of [undefined, false, null, "true", 1]) assert.equal(isExplicitLiuhaoyiRecoveryExecution(value), false);
  assert.equal(isExplicitLiuhaoyiRecoveryExecution(true), true);
  assert.equal(decision().eligible, true);
  for (const session of [{ provider: "generic_api" }, { businessType: "order" },
    { channelCode: "wechat" }, { currency: "USDT" }]) {
    assert.equal(decision({ session }).reason, "scope_not_allowed");
  }
});

test("callback gets a full minute and inactive session/recharge cannot recover", () => {
  const graceNow = Date.parse("2026-09-15T10:00:00+08:00");
  assert.equal(decision({ nowMs: graceNow, session: { createdAt: "2026-09-15T09:59:00.001+08:00" } }).reason, "callback_grace_period");
  assert.equal(decision({ nowMs: graceNow, session: { createdAt: "2026-09-15T09:59:00+08:00" },
    provider: { endtime: "2026-09-15 09:59:30" } }).eligible, true);
  assert.equal(decision({ session: { localStatus: "expired" } }).reason, "session_not_active");
  assert.equal(decision({ recharge: { status: "expired" } }).reason, "recharge_not_active");
});

test("ownership, credited state, completed state and completed ledger fail closed", () => {
  assert.equal(decision({ recharge: null }).reason, "recharge_missing");
  assert.equal(decision({ recharge: { id: "other" } }).reason, "ownership_mismatch");
  assert.equal(decision({ recharge: { rechargeNo: "other" } }).reason, "ownership_mismatch");
  assert.equal(decision({ recharge: { userId: "other" } }).reason, "ownership_mismatch");
  assert.equal(decision({ recharge: { creditedAmount: 1 } }).reason, "recharge_already_credited");
  assert.equal(decision({ recharge: { completedAt: "2026-09-15T09:59:30+08:00" } }).reason, "recharge_already_credited");
  assert.equal(decision({ ledgerCount: 1 }).reason, "completed_ledger_exists");
});

test("provider evidence requires paid Alipay, exact amount and identifiers", () => {
  const cases = [
    [{ found: false }, "provider_not_found"], [{ status: "pending" }, "provider_not_paid"],
    [{ currency: "USDT" }, "currency_mismatch"], [{ amount: "1.01" }, "amount_mismatch"],
    [{ amount: null }, "amount_mismatch"], [{ type: "wxpay" }, "provider_type_mismatch"],
    [{ tradeNo: null }, "provider_trade_no_missing"], [{ tradeNo: "OTHER" }, "provider_order_no_mismatch"],
    [{ outTradeNo: null }, "out_trade_no_missing"], [{ outTradeNo: "OTHER" }, "out_trade_no_mismatch"],
  ];
  for (const [provider, reason] of cases) assert.equal(decision({ provider }).reason, reason);
  assert.equal(decision({ session: { providerOrderNo: null } }).reason, "provider_order_no_missing");
  assert.equal(decision({ session: { localTradeNo: "OTHER" } }).reason, "provider_transaction_id_conflict");
});

test("paid time is required, parseable, and may equal but never exceed either expiry", () => {
  assert.equal(liuhaoyiPaidTimeMs("2026-09-15 10:20:00"), Date.parse("2026-09-15T10:20:00+08:00"));
  assert.equal(decision({ provider: { endtime: null, paidAt: null } }).reason, "provider_paid_time_missing");
  assert.equal(decision({ provider: { endtime: "not-a-time" } }).reason, "provider_paid_time_missing");
  assert.equal(decision({ provider: { endtime: "2026-09-15 10:20:00" } }).eligible, true);
  const late = decision({ provider: { endtime: "2026-09-15 10:20:01" } });
  assert.equal(late.reason, "provider_paid_after_expiry");
  assert.equal(late.manualReview, true);
  assert.equal(decision({ recharge: { expiresAt: "2026-09-15T10:19:58+08:00" } }).reason, "provider_paid_after_expiry");
});

test("paid in time remains eligible when recovery runs after expiry", () => {
  const afterExpiry = evaluateLiuhaoyiAlipayRechargeRecovery({
    ...candidate(),
    nowMs,
  });
  assert.deepEqual(afterExpiry, {
    eligible: true, reason: "eligible", manualReview: false,
    differenceType: "provider_paid_local_unpaid",
  });
});

test("untrusted or impossible provider paid time fails closed", () => {
  assert.equal(decision({ provider: { endtime: "2026-09-15T09:58:58" } }).reason,
    "provider_paid_time_invalid");
  assert.equal(decision({ recharge: { createdAt: null } }).reason, "provider_paid_time_invalid");
  assert.equal(decision({ provider: { endtime: "2026-09-15T10:00:00" },
    session: { createdAt: "2026-09-15T10:00:01+08:00" } }).reason, "provider_paid_time_invalid");
});

test("worker defaults dry-run and redacts malformed or exceptional provider output", async () => {
  const bodies = [];
  const payload = { mode: "dry_run", session_no: "PS-RECOVERY-1", session_found: true,
    recharge_found: true, provider_found: true, provider_paid: true, provider_type_match: true,
    amount_match: true, paid_within_expiry: true, local_already_credited: false, ledger_count: 0,
    eligible: true, would_complete: true, completed: false, idempotent: false,
    manual_review: false, reason: "eligible" };
  const result = await runLiuhaoyiAlipayRecoveryWorker({ baseUrl: "http://127.0.0.1:3001",
    secret: "do-not-log", sessionNo: "PS-RECOVERY-1", write: () => {},
    fetchImpl: async (_url, init) => { bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify(payload), { status: 200 }); } });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(bodies, [{ sessionNo: "PS-RECOVERY-1", execute: false }]);
  const lines = [];
  const failed = await runLiuhaoyiAlipayRecoveryWorker({ baseUrl: "http://127.0.0.1:3001",
    secret: "secret-do-not-log", sessionNo: "PS-RECOVERY-1",
    fetchImpl: async () => { throw new Error("https://provider.invalid/?key=secret&sign=secret"); },
    write: (line) => lines.push(line) });
  assert.equal(failed.reason, "worker_failed");
  assert.equal(lines.join("").includes("key="), false);
  assert.equal(lines.join("").includes("secret-do-not-log"), false);
});

test("service uses only canonical completion and de-duplicated safe manual evidence", () => {
  const source = readFileSync(new URL("../../lib/payments/liuhaoyi-alipay-recovery-service.ts", import.meta.url), "utf8");
  assert.match(source, /if \(execute && decision\.eligible\)[\s\S]*await completePayment\(/);
  assert.doesNotMatch(source, /from\("profiles"\)[\s\S]*\.update|from\("balance_transactions"\)[\s\S]*\.insert/);
  assert.match(source, /dedupe_key:[\s\S]*onConflict: "dedupe_key"/);
  assert.doesNotMatch(source, /MerchantKey|sign=|query URL/i);
});
