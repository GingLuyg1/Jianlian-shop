import assert from "node:assert/strict";
import test from "node:test";

import {
  LIUHAOYI_RECHARGE_TTL_MINUTES,
  canContinueLiuhaoyiRechargePayment,
  createLiuhaoyiRechargeWindow,
  isRechargePastDue,
  shouldExpireLiuhaoyiRecharge,
} from "../../lib/payments/recharge-expiry.mjs";

test("Liuhaoyi recharge window is exactly 15 minutes", () => {
  const now = new Date("2026-09-14T10:00:00.000Z");
  const window = createLiuhaoyiRechargeWindow(now);
  assert.equal(LIUHAOYI_RECHARGE_TTL_MINUTES, 15);
  assert.equal(window.createdAt, "2026-09-14T10:00:00.000Z");
  assert.equal(window.expiresAt, "2026-09-14T10:15:00.000Z");
});

test("active Liuhaoyi recharge can continue only before expiry", () => {
  const recharge = {
    channelCode: "alipay",
    status: "pending",
    expiresAt: "2026-09-14T10:15:00.000Z",
  };
  assert.equal(canContinueLiuhaoyiRechargePayment(recharge, new Date("2026-09-14T10:14:59.999Z")), true);
  assert.equal(canContinueLiuhaoyiRechargePayment(recharge, new Date("2026-09-14T10:15:00.000Z")), false);
  assert.equal(isRechargePastDue(recharge.expiresAt, new Date("2026-09-14T10:15:00.000Z")), true);
});

test("only active Liuhaoyi recharge records are expired by the shared rule", () => {
  const now = new Date("2026-09-14T10:16:00.000Z");
  assert.equal(shouldExpireLiuhaoyiRecharge({ channel: "wechat", status: "processing", expires_at: "2026-09-14T10:15:00.000Z" }, now), true);
  assert.equal(shouldExpireLiuhaoyiRecharge({ channel: "usdt_bep20", status: "waiting_payment", expires_at: "2026-09-14T10:15:00.000Z" }, now), false);
  assert.equal(shouldExpireLiuhaoyiRecharge({ channel: "alipay", status: "paid", expires_at: "2026-09-14T10:15:00.000Z" }, now), false);
});

test("expired recharge never exposes continue-payment eligibility", () => {
  assert.equal(canContinueLiuhaoyiRechargePayment({
    channelCode: "wechat_pay",
    status: "expired",
    expiresAt: "2026-09-14T11:00:00.000Z",
  }, new Date("2026-09-14T10:00:00.000Z")), false);
});
