import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateLiuhaoyiAlipayRechargeRecovery,
} from "../../lib/payments/liuhaoyi-recovery-policy.mjs";

const nowMs = Date.parse("2026-09-15T10:25:00.000Z");

function recoveryInput(overrides = {}) {
  return {
    session: {
      provider: "liuhaoyi",
      businessType: "recharge",
      businessId: "recharge-id",
      businessNo: "RC-BEHAVIOR-1",
      userId: "user-1",
      channelCode: "alipay",
      localStatus: "pending",
      expiresAt: "2026-09-15T10:20:00.000Z",
      createdAt: "2026-09-15T09:59:00.000Z",
      currency: "CNY",
      localAmount: "1.00",
      sessionNo: "PS-BEHAVIOR-1",
      providerOrderNo: "LHY-BEHAVIOR-1",
      localTradeNo: null,
      ...overrides.session,
    },
    recharge: {
      id: "recharge-id",
      rechargeNo: "RC-BEHAVIOR-1",
      userId: "user-1",
      status: "pending",
      createdAt: "2026-09-15T09:59:00.000Z",
      expiresAt: "2026-09-15T10:20:00.000Z",
      creditedAmount: 0,
      completedAt: null,
      ...overrides.recharge,
    },
    provider: {
      found: true,
      status: "paid",
      currency: "CNY",
      amount: "1.00",
      type: "alipay",
      tradeNo: "LHY-BEHAVIOR-1",
      outTradeNo: "PS-BEHAVIOR-1",
      endtime: "2026-09-15 18:19:59",
      ...overrides.provider,
    },
    ledgerCount: 0,
    nowMs,
  };
}

function atomicCompletionHarness() {
  let locked = Promise.resolve();
  const state = { paid: false, balance: 21, ledgerKeys: new Set() };
  const complete = () => {
    const operation = locked.then(() => {
      if (state.paid) return { idempotent: true };
      state.paid = true;
      state.balance += 1;
      state.ledgerKeys.add("account_recharge:RC-BEHAVIOR-1");
      return { idempotent: false };
    });
    locked = operation.then(() => undefined);
    return operation;
  };
  return { state, complete };
}

async function workerAttempt(input, complete) {
  const decision = evaluateLiuhaoyiAlipayRechargeRecovery(input);
  if (!decision.eligible) return { attempted: false, decision };
  return { attempted: true, decision, completion: await complete() };
}

test("callback first then worker credits exactly once", async () => {
  const atomic = atomicCompletionHarness();
  await atomic.complete();
  const result = await workerAttempt(
    recoveryInput({ session: { localStatus: "paid" }, recharge: { status: "paid" } }),
    atomic.complete,
  );
  assert.equal(result.attempted, false);
  assert.equal(atomic.state.balance, 22);
  assert.equal(atomic.state.ledgerKeys.size, 1);
});

test("worker first then callback credits exactly once", async () => {
  const atomic = atomicCompletionHarness();
  const worker = await workerAttempt(recoveryInput(), atomic.complete);
  const callback = await atomic.complete();
  assert.equal(worker.completion.idempotent, false);
  assert.equal(callback.idempotent, true);
  assert.equal(atomic.state.balance, 22);
  assert.equal(atomic.state.ledgerKeys.size, 1);
});

test("two workers converge on one atomic credit and one ledger key", async () => {
  const atomic = atomicCompletionHarness();
  const results = await Promise.all([
    workerAttempt(recoveryInput(), atomic.complete),
    workerAttempt(recoveryInput(), atomic.complete),
  ]);
  assert.deepEqual(results.map((entry) => entry.completion.idempotent), [false, true]);
  assert.equal(atomic.state.balance, 22);
  assert.deepEqual([...atomic.state.ledgerKeys], ["account_recharge:RC-BEHAVIOR-1"]);
});

test("provider payment after persisted expiry is fail-closed before the completion RPC", async () => {
  const atomic = atomicCompletionHarness();
  let calls = 0;
  const result = await workerAttempt(
    recoveryInput({ session: { expiresAt: "2026-09-15T10:00:05.000Z" },
      provider: { endtime: "2026-09-15 18:00:06" } }),
    async () => {
      calls += 1;
      return atomic.complete();
    },
  );
  assert.equal(result.attempted, false);
  assert.equal(result.decision.reason, "provider_paid_after_expiry");
  assert.equal(calls, 0);
  assert.equal(atomic.state.balance, 21);
  assert.equal(atomic.state.ledgerKeys.size, 0);
});
