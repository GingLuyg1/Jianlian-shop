import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateLiuhaoyiAlipayRechargeRecovery,
  LIUHAOYI_ALIPAY_RECHARGE_RECOVERY_MODE,
} from "../../lib/payments/liuhaoyi-recovery-policy.mjs";

const nowMs = Date.parse("2026-09-15T10:00:00.000Z");

function eligible(overrides = {}) {
  return {
    session: {
      provider: "liuhaoyi",
      businessType: "recharge",
      channelCode: "alipay",
      localStatus: "pending",
      expiresAt: "2026-09-15T10:20:00.000Z",
      createdAt: "2026-09-15T09:59:00.000Z",
      currency: "CNY",
      localAmount: 1,
      sessionNo: "PS-RECOVERY-1",
      providerOrderNo: "LHY-TRADE-1",
      localTradeNo: null,
      ...overrides.session,
    },
    recharge: {
      status: "pending",
      expiresAt: "2026-09-15T10:20:00.000Z",
      ...overrides.recharge,
    },
    provider: {
      found: true,
      status: "paid",
      currency: "CNY",
      amount: "1.00",
      type: "alipay",
      tradeNo: "LHY-TRADE-1",
      outTradeNo: "PS-RECOVERY-1",
      ...overrides.provider,
    },
    nowMs,
  };
}

function decision(overrides = {}) {
  return evaluateLiuhaoyiAlipayRechargeRecovery(eligible(overrides));
}

test("recovery mode is explicitly limited to Liuhaoyi Alipay account recharge", () => {
  assert.equal(LIUHAOYI_ALIPAY_RECHARGE_RECOVERY_MODE, "alipay_account_recharge_v1");
  assert.equal(decision().eligible, true);
  for (const session of [
    { provider: "generic_api" },
    { businessType: "order" },
    { channelCode: "wechat" },
  ]) {
    assert.deepEqual(decision({ session }), {
      eligible: false,
      reason: "scope_not_allowed",
      manualReview: false,
      differenceType: null,
    });
  }
});

test("active session and active recharge both require safe remaining lifetime", () => {
  assert.equal(decision({ session: { localStatus: "expired" } }).eligible, false);
  assert.equal(
    decision({ session: { expiresAt: "2026-09-15T09:59:59.000Z" } }).reason,
    "session_expired_or_too_close",
  );
  assert.equal(
    decision({ session: { expiresAt: "2026-09-15T10:00:05.000Z" } }).reason,
    "session_expired_or_too_close",
  );
  assert.equal(decision({ recharge: { status: "expired" } }).reason, "recharge_not_active");
  assert.equal(
    decision({ recharge: { expiresAt: "2026-09-15T09:59:59.000Z" } }).reason,
    "recharge_expired_or_too_close",
  );
});

test("natural callback receives a thirty-second grace period", () => {
  const result = decision({ session: { createdAt: "2026-09-15T09:59:45.000Z" } });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "callback_grace_period");
  assert.equal(result.manualReview, false);
});

test("provider evidence must be found, paid, exact CNY amount, and Alipay", () => {
  assert.equal(decision({ provider: { found: false } }).reason, "provider_not_found");
  assert.equal(decision({ provider: { status: "pending" } }).reason, "provider_not_paid");
  assert.equal(decision({ provider: { currency: "USDT" } }).reason, "currency_mismatch");
  assert.equal(decision({ provider: { amount: "1.01" } }).reason, "amount_mismatch");
  assert.equal(decision({ provider: { amount: "1.001" } }).reason, "amount_mismatch");
  assert.equal(decision({ provider: { amount: "1e0" } }).reason, "amount_mismatch");
  assert.equal(decision({ provider: { amount: undefined } }).reason, "amount_mismatch");
  assert.equal(decision({ provider: { type: "wxpay" } }).reason, "provider_type_mismatch");
});

test("provider and merchant identifiers must match without fuzzy fallback", () => {
  assert.equal(decision({ provider: { tradeNo: null } }).reason, "provider_trade_no_missing");
  assert.equal(decision({ session: { providerOrderNo: null } }).reason, "provider_order_no_missing");
  assert.equal(
    decision({ provider: { tradeNo: "OTHER" } }).reason,
    "provider_order_no_mismatch",
  );
  assert.equal(
    decision({ session: { localTradeNo: "OTHER" } }).reason,
    "provider_transaction_id_conflict",
  );
  assert.equal(
    decision({ provider: { outTradeNo: "OTHER" } }).reason,
    "out_trade_no_mismatch",
  );
  assert.equal(decision({ provider: { outTradeNo: null } }).eligible, true);
});

test("paid, expired, closed, and failed local sessions never auto recover", () => {
  for (const localStatus of ["paid", "expired", "closed", "failed"]) {
    assert.equal(decision({ session: { localStatus } }).eligible, false);
  }
});
