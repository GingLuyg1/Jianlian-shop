import assert from "node:assert/strict";
import test from "node:test";

import {
  Bep20UnderpaymentRuntimeError,
  isBep20UnderpaymentIrreversibleConfirmation,
  readBep20UnderpaymentCandidatesSafely,
  readBep20UnderpaymentConfirmations,
  settleBep20UnderpaymentCandidates,
  summarizeBep20UnderpaymentBatch,
  summarizeBep20UnderpaymentSessionId,
} from "../../lib/payments/bep20-underpayment-runtime.mjs";

test("underpayment settlement confirmation configuration fails closed", () => {
  for (const value of [undefined, null, "", "0", "1.5", "1001", "not-a-number"]) {
    assert.throws(
      () => readBep20UnderpaymentConfirmations(value),
      (error) => error instanceof Bep20UnderpaymentRuntimeError
        && error.code === "BEP20_UNDERPAYMENT_CONFIRMATION_CONFIG_INVALID",
    );
  }
  assert.equal(readBep20UnderpaymentConfirmations("12"), 12);
  assert.equal(readBep20UnderpaymentConfirmations("1000"), 1000);
});

test("manual underpayment settlement requires literal irreversible confirmation", () => {
  assert.equal(isBep20UnderpaymentIrreversibleConfirmation(true), true);
  for (const value of [false, undefined, null, 1, "true", { confirmed: true }]) {
    assert.equal(isBep20UnderpaymentIrreversibleConfirmation(value), false);
  }
});

test("one failed settlement does not abort the remaining batch", async () => {
  const visited = [];
  const results = await settleBep20UnderpaymentCandidates(
    ["session-a", "session-b", "session-c"],
    async (sessionId) => {
      visited.push(sessionId);
      if (sessionId === "session-b") throw new Error("synthetic failure");
      return { ok: true, code: "SETTLED", sessionId };
    },
    (sessionId) => ({ ok: false, code: "SETTLEMENT_FAILED", sessionId }),
  );

  assert.deepEqual(visited, ["session-a", "session-b", "session-c"]);
  assert.deepEqual(results.map((item) => item.code), ["SETTLED", "SETTLEMENT_FAILED", "SETTLED"]);
  assert.deepEqual(summarizeBep20UnderpaymentBatch(results), {
    processed: 2,
    skipped: 0,
    failed: 1,
  });
});

test("candidate read failures return a stable safe result", async () => {
  const result = await readBep20UnderpaymentCandidatesSafely(async () => {
    throw new Error("sensitive database detail");
  });
  assert.deepEqual(result, {
    ok: false,
    code: "BEP20_UNDERPAYMENT_LIST_FAILED",
    candidates: [],
  });
  assert.equal(JSON.stringify(result).includes("sensitive database detail"), false);
});

test("already settled candidates are counted as skipped", () => {
  assert.deepEqual(summarizeBep20UnderpaymentBatch([
    { ok: true, code: "SETTLED" },
    { ok: true, code: "ALREADY_SETTLED" },
    { ok: false, code: "SETTLEMENT_FAILED" },
  ]), {
    processed: 1,
    skipped: 1,
    failed: 1,
  });
});

test("dry-run identifiers can be represented without exposing a complete session id", () => {
  const sessionId = "12345678-1234-1234-1234-123456789abc";
  const summary = summarizeBep20UnderpaymentSessionId(sessionId);
  assert.equal(summary, "12345678...789abc");
  assert.equal(summary.includes(sessionId), false);
});
