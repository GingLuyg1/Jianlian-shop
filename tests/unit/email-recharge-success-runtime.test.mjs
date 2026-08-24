import test from "node:test";
import assert from "node:assert/strict";

import {
  formatRechargeCreditedAmount,
  queueRechargeSuccessEmailRuntime,
} from "../../lib/email/recharge-success-runtime.mjs";

function createDependencies(overrides = {}) {
  return {
    queue: async () => ({ ok: true, deduped: false, job: { id: "job-1" } }),
    createIdempotencyKey: (parts) => parts.map((part) => String(part ?? "none").trim()).join(":"),
    warn: () => {},
    ...overrides,
  };
}

test("formatRechargeCreditedAmount normalizes numeric(18,6) values", () => {
  assert.equal(formatRechargeCreditedAmount("100"), "100.00");
  assert.equal(formatRechargeCreditedAmount("100.500000"), "100.50");
  assert.equal(formatRechargeCreditedAmount("100.123400"), "100.1234");
  assert.equal(formatRechargeCreditedAmount(88.5), "88.50");
});

test("formatRechargeCreditedAmount rejects non-positive or over-scale values", () => {
  assert.throws(() => formatRechargeCreditedAmount("0"), RangeError);
  assert.throws(() => formatRechargeCreditedAmount("-1"), RangeError);
  assert.throws(() => formatRechargeCreditedAmount("1.1234567"), RangeError);
});

test("queueRechargeSuccessEmailRuntime queues the recharge_success template with deterministic idempotency", async () => {
  let queuedInput = null;
  const result = await queueRechargeSuccessEmailRuntime(
    {
      userId: "user-1",
      recipientEmail: "USER@example.com",
      rechargeId: "recharge-1",
      rechargeNo: "RC202608220001",
      creditedAmount: "200.000000",
      currency: "cny",
      source: "recharge_review",
    },
    createDependencies({
      queue: async (input) => {
        queuedInput = input;
        return { ok: true, deduped: false, job: { id: "job-1" } };
      },
    }),
  );

  assert.deepEqual(result, {
    ok: true,
    queued: true,
    deduped: false,
    job: { id: "job-1" },
  });
  assert.deepEqual(queuedInput, {
    userId: "user-1",
    recipientEmail: "USER@example.com",
    templateCode: "recharge_success",
    variables: {
      recharge_no: "RC202608220001",
      credited_amount: "200.00",
      currency: "CNY",
    },
    businessType: "recharge",
    businessId: "recharge-1",
    businessNo: "RC202608220001",
    idempotencyKey: "email:recharge_success:recharge:recharge-1:v1",
    metadata: { source: "recharge_review" },
  });
});

test("queueRechargeSuccessEmailRuntime preserves deduped queue results", async () => {
  const result = await queueRechargeSuccessEmailRuntime(
    {
      userId: "user-1",
      recipientEmail: "user@example.com",
      rechargeId: "recharge-1",
      rechargeNo: "RC1",
      creditedAmount: "10",
      currency: "CNY",
      source: "bep20_scanner",
    },
    createDependencies({
      queue: async () => ({ ok: true, deduped: true, job: { id: "existing-job" } }),
    }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.queued, true);
  assert.equal(result.deduped, true);
});

test("queueRechargeSuccessEmailRuntime is best-effort when queue creation fails", async () => {
  const warnings = [];
  const result = await queueRechargeSuccessEmailRuntime(
    {
      userId: "user-1",
      recipientEmail: "user@example.com",
      rechargeId: "recharge-1",
      rechargeNo: "RC1",
      creditedAmount: "10",
      currency: "CNY",
      source: "recharge_review",
    },
    createDependencies({
      queue: async () => ({ ok: false, error: "template missing" }),
      warn: (code, context) => warnings.push({ code, context }),
    }),
  );

  assert.deepEqual(result, { ok: true, queued: false, error: "queue_failed" });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].code, "queue_failed");
});

test("queueRechargeSuccessEmailRuntime skips unsafe or incomplete inputs without throwing", async () => {
  let queueCalls = 0;
  const dependencies = createDependencies({
    queue: async () => {
      queueCalls += 1;
      return { ok: true, deduped: false, job: {} };
    },
    warn: () => {
      throw new Error("warning sink failed");
    },
  });

  const missingRecipient = await queueRechargeSuccessEmailRuntime(
    {
      userId: "user-1",
      recipientEmail: "",
      rechargeId: "recharge-1",
      rechargeNo: "RC1",
      creditedAmount: "10",
      currency: "CNY",
      source: "recharge_review",
    },
    dependencies,
  );
  assert.deepEqual(missingRecipient, { ok: true, queued: false, skipped: "missing_recipient_email" });

  const missingIdentity = await queueRechargeSuccessEmailRuntime(
    {
      userId: "user-1",
      recipientEmail: "user@example.com",
      rechargeId: "",
      rechargeNo: "",
      creditedAmount: "10",
      currency: "CNY",
      source: "recharge_review",
    },
    dependencies,
  );
  assert.deepEqual(missingIdentity, { ok: true, queued: false, skipped: "missing_recharge_identity" });

  const invalidAmount = await queueRechargeSuccessEmailRuntime(
    {
      userId: "user-1",
      recipientEmail: "user@example.com",
      rechargeId: "recharge-1",
      rechargeNo: "RC1",
      creditedAmount: "0",
      currency: "CNY",
      source: "recharge_review",
    },
    dependencies,
  );
  assert.deepEqual(invalidAmount, { ok: true, queued: false, error: "invalid_credited_amount" });

  const invalidCurrency = await queueRechargeSuccessEmailRuntime(
    {
      userId: "user-1",
      recipientEmail: "user@example.com",
      rechargeId: "recharge-1",
      rechargeNo: "RC1",
      creditedAmount: "10",
      currency: "",
      source: "recharge_review",
    },
    dependencies,
  );
  assert.deepEqual(invalidCurrency, { ok: true, queued: false, skipped: "invalid_currency" });

  assert.equal(queueCalls, 0);
});
