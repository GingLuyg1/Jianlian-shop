import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  evaluateLiuhaoyiWechatRechargeRecovery,
  liuhaoyiPaidTimeMs,
} from "../../lib/payments/liuhaoyi-recovery-policy.mjs";
import { runLiuhaoyiWechatRecoveryWorker } from "../../scripts/ops/liuhaoyi-wechat-recharge-recovery.mjs";

const nowMs = Date.parse("2026-09-17T00:45:00+08:00");
function candidate(overrides = {}) {
  return {
    session: {
      provider: "liuhaoyi", businessType: "recharge", businessId: "recharge-id", businessNo: "RC-WX-1",
      userId: "user-1", channelCode: "wechat", localStatus: "pending", createdAt: "2026-09-17T00:42:40+08:00",
      expiresAt: "2026-09-17T01:12:40+08:00", currency: "CNY", localAmount: "1.00",
      sessionNo: "PS-WX-RECOVERY-1", providerOrderNo: "WX-TRADE-1", localTradeNo: null,
      ...overrides.session,
    },
    recharge: {
      id: "recharge-id", rechargeNo: "RC-WX-1", userId: "user-1", status: "pending",
      createdAt: "2026-09-17T00:42:40+08:00", expiresAt: "2026-09-17T01:12:40+08:00",
      creditedAmount: 0, completedAt: null,
      ...overrides.recharge,
    },
    provider: {
      found: true, status: "paid", currency: "CNY", amount: "1.00", type: "wxpay",
      tradeNo: "WX-TRADE-1", outTradeNo: "PS-WX-RECOVERY-1", endtime: "2026-09-17 00:43:08",
      ...overrides.provider,
    },
    ledgerCount: overrides.ledgerCount ?? 0,
    nowMs,
  };
}

test("current paid-within-expiry WeChat incident is eligible in dry-run policy", () => {
  assert.equal(liuhaoyiPaidTimeMs("2026-09-17 00:43:08"), Date.parse("2026-09-17T00:43:08+08:00"));
  assert.deepEqual(evaluateLiuhaoyiWechatRechargeRecovery(candidate()), {
    eligible: true, reason: "eligible", manualReview: false, differenceType: "provider_paid_local_unpaid",
  });
});

test("paid before or exactly at expiry remains eligible when recovery runs after expiry", () => {
  const paidBefore = candidate({ provider: { endtime: "2026-09-17 01:12:39" } });
  paidBefore.nowMs = Date.parse("2026-09-17T01:20:00+08:00");
  assert.equal(evaluateLiuhaoyiWechatRechargeRecovery(paidBefore).eligible, true);

  const paidAtExpiry = candidate({ provider: { endtime: "2026-09-17 01:12:40" } });
  paidAtExpiry.nowMs = Date.parse("2026-09-17T01:20:00+08:00");
  assert.equal(evaluateLiuhaoyiWechatRechargeRecovery(paidAtExpiry).eligible, true);
});

test("WeChat recovery rejects cross-channel, ownership, amount, type, credited and ledger mismatches", () => {
  assert.equal(evaluateLiuhaoyiWechatRechargeRecovery(candidate({ session: { channelCode: "alipay" } })).reason, "scope_not_allowed");
  assert.equal(evaluateLiuhaoyiWechatRechargeRecovery(candidate({ recharge: { userId: "other" } })).reason, "ownership_mismatch");
  assert.equal(evaluateLiuhaoyiWechatRechargeRecovery(candidate({ provider: { amount: "1.01" } })).reason, "amount_mismatch");
  assert.equal(evaluateLiuhaoyiWechatRechargeRecovery(candidate({ provider: { type: "alipay" } })).reason, "provider_type_mismatch");
  assert.equal(evaluateLiuhaoyiWechatRechargeRecovery(candidate({ recharge: { creditedAmount: 1 } })).reason, "recharge_already_credited");
  assert.equal(evaluateLiuhaoyiWechatRechargeRecovery(candidate({ ledgerCount: 1 })).reason, "completed_ledger_exists");
});

test("provider payment after local expiry is manual review and never eligible", () => {
  const input = candidate({ provider: { endtime: "2026-09-17 01:12:41" } });
  input.nowMs = Date.parse("2026-09-17T01:15:00+08:00");
  const decision = evaluateLiuhaoyiWechatRechargeRecovery(input);
  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, "provider_paid_after_expiry");
  assert.equal(decision.manualReview, true);
});

test("missing or invalid provider paid time is manual review and never eligible", () => {
  for (const endtime of [undefined, "invalid-paid-time"]) {
    const decision = evaluateLiuhaoyiWechatRechargeRecovery(candidate({ provider: { endtime } }));
    assert.equal(decision.eligible, false);
    assert.equal(decision.manualReview, true);
    assert.equal(decision.reason, "provider_paid_time_missing");
  }
});

test("WeChat recovery rejects every identity, currency, completion and ledger conflict", () => {
  const cases = [
    [candidate({ provider: { currency: "USD" } }), "currency_mismatch"],
    [candidate({ provider: { type: "alipay" } }), "provider_type_mismatch"],
    [candidate({ session: { localTradeNo: "OTHER-TRADE" } }), "provider_transaction_id_conflict"],
    [candidate({ provider: { tradeNo: "OTHER-PROVIDER-ORDER" } }), "provider_order_no_mismatch"],
    [candidate({ provider: { outTradeNo: "PS-WRONG-SESSION" } }), "out_trade_no_mismatch"],
    [candidate({ ledgerCount: 1 }), "completed_ledger_exists"],
    [candidate({ recharge: { creditedAmount: 1 } }), "recharge_already_credited"],
    [candidate({ recharge: { completedAt: "2026-09-17T00:43:09+08:00" } }), "recharge_already_credited"],
    [candidate({ recharge: { userId: "other-user" } }), "ownership_mismatch"],
    [candidate({ recharge: { rechargeNo: "RC-WRONG" } }), "ownership_mismatch"],
    [candidate({ session: { businessId: "wrong-recharge-id" } }), "ownership_mismatch"],
  ];
  for (const [input, reason] of cases) {
    const decision = evaluateLiuhaoyiWechatRechargeRecovery(input);
    assert.equal(decision.eligible, false);
    assert.equal(decision.reason, reason);
  }
});

test("natural callback completed first makes WeChat recovery ineligible", () => {
  const decision = evaluateLiuhaoyiWechatRechargeRecovery(candidate({
    session: { localStatus: "paid" },
    recharge: { status: "paid", creditedAmount: 1, completedAt: "2026-09-17T00:43:09+08:00" },
    ledgerCount: 1,
  }));
  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, "session_not_active");
});

test("worker is single-session and dry-run by default; execute requires the explicit flag", async () => {
  const bodies = [];
  const payload = { mode: "dry_run", session_no: "PS-WX-RECOVERY-1", session_found: true, recharge_found: true, provider_found: true, provider_paid: true, provider_type_match: true, amount_match: true, paid_within_expiry: true, local_already_credited: false, ledger_count: 0, eligible: true, would_complete: true, completed: false, idempotent: false, manual_review: false, reason: "eligible" };
  const result = await runLiuhaoyiWechatRecoveryWorker({
    baseUrl: "http://127.0.0.1:3001", secret: "test-only-secret", sessionNo: "PS-WX-RECOVERY-1",
    fetchImpl: async (_url, init) => { bodies.push(JSON.parse(init.body)); return new Response(JSON.stringify(payload), { status: 200 }); },
    write: () => {},
  });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(bodies, [{ sessionNo: "PS-WX-RECOVERY-1", execute: false }]);
});

test("service uses canonical completion and dry-run performs no write path", () => {
  const source = readFileSync(new URL("../../lib/payments/liuhaoyi-wechat-recovery-service.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../../app/api/internal/payments/liuhaoyi-wechat-recharge-recovery/route.ts", import.meta.url), "utf8");
  assert.match(source, /if \(execute && decision\.eligible\)[\s\S]*await completePayment\(/);
  assert.doesNotMatch(source, /from\("profiles"\)[\s\S]*\.update|from\("balance_transactions"\)[\s\S]*\.insert/);
  assert.match(route, /isExplicitLiuhaoyiRecoveryExecution\(body\?\.execute\)/);
  assert.match(route, /if \(!sessionNo\)/);
  assert.doesNotMatch(route, /batchSize|listSessions/);
});
