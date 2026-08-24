import assert from "node:assert/strict";
import test from "node:test";

import {
  decideEmailDeliveryOutcome,
  isIdempotencyKeyUniqueConflict,
  isStaleProcessingJob,
  processEmailDeliveryJobRuntime,
  validateQueueUserId,
} from "../../lib/email/job-runtime.mjs";

const retryableFailure = {
  provider: "resend",
  providerMessageId: null,
  status: "failed",
  acceptedAt: null,
  errorCode: "EMAIL_PROVIDER_TIMEOUT",
  errorMessage: "timeout",
};

test("the last retryable attempt becomes failed with no next retry", () => {
  const outcome = decideEmailDeliveryOutcome({
    result: retryableFailure,
    attempts: 5,
    maxAttempts: 5,
    now: new Date("2026-08-22T00:00:00.000Z"),
    computeNextRetryAt: () => "should-not-be-used",
    isRetryableError: () => true,
  });
  assert.deepEqual(outcome, { status: "failed", sentAt: null, nextRetryAt: null });
});

test("a retryable attempt below the limit schedules a retry", () => {
  const outcome = decideEmailDeliveryOutcome({
    result: retryableFailure,
    attempts: 4,
    maxAttempts: 5,
    now: new Date("2026-08-22T00:00:00.000Z"),
    computeNextRetryAt: () => "2026-08-22T00:01:00.000Z",
    isRetryableError: () => true,
  });
  assert.deepEqual(outcome, {
    status: "retrying",
    sentAt: null,
    nextRetryAt: "2026-08-22T00:01:00.000Z",
  });
});

test("only processing jobs older than fifteen minutes are stale", () => {
  const now = new Date("2026-08-22T00:20:00.000Z");
  assert.equal(isStaleProcessingJob({ status: "processing", updated_at: "2026-08-22T00:00:00.000Z" }, now), true);
  assert.equal(isStaleProcessingJob({ status: "processing", updated_at: "2026-08-22T00:10:00.000Z" }, now), false);
  assert.equal(isStaleProcessingJob({ status: "retrying", updated_at: "2026-08-22T00:00:00.000Z" }, now), false);
});

test("two workers racing for one stale job call the provider at most once", async () => {
  const clock = new Date("2026-08-22T00:20:00.000Z");
  const shared = makeJob();
  let providerCalls = 0;

  const dependencies = makeRuntimeDependencies(shared, {
    now: () => clock,
    send: async () => {
      providerCalls += 1;
      return sentResult();
    },
  });

  const [first, second] = await Promise.all([
    processEmailDeliveryJobRuntime({ jobId: shared.id, triggerSource: "worker-a", ...dependencies }),
    processEmailDeliveryJobRuntime({ jobId: shared.id, triggerSource: "worker-b", ...dependencies }),
  ]);

  assert.equal(providerCalls, 1);
  assert.equal([first, second].filter((result) => result.ok).length, 1);
  assert.equal(shared.status, "sent");
});

test("a fresh processing job is not claimed or sent", async () => {
  const shared = makeJob({ updated_at: "2026-08-22T00:10:00.000Z" });
  let providerCalls = 0;
  const result = await processEmailDeliveryJobRuntime({
    jobId: shared.id,
    triggerSource: "worker",
    ...makeRuntimeDependencies(shared, {
      now: () => new Date("2026-08-22T00:20:00.000Z"),
      send: async () => {
        providerCalls += 1;
        return sentResult();
      },
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(providerCalls, 0);
});

test("attempt-log failure does not undo a provider-accepted final state or resend", async () => {
  const shared = makeJob();
  let providerCalls = 0;
  const dependencies = makeRuntimeDependencies(shared, {
    now: () => new Date("2026-08-22T00:20:00.000Z"),
    send: async () => {
      providerCalls += 1;
      return sentResult();
    },
    recordAttempt: async () => {
      throw new Error("attempt insert failed");
    },
  });

  const first = await processEmailDeliveryJobRuntime({ jobId: shared.id, triggerSource: "worker", ...dependencies });
  const second = await processEmailDeliveryJobRuntime({ jobId: shared.id, triggerSource: "worker", ...dependencies });
  assert.equal(first.ok, true);
  assert.equal(first.attemptLogWarning, "邮件发送尝试日志写入异常。");
  assert.equal(second.ok, true);
  assert.equal(second.deduped, true);
  assert.equal(providerCalls, 1);
});

test("queue identity and idempotency conflict helpers fail closed", () => {
  assert.equal(validateQueueUserId(null).ok, false);
  assert.equal(validateQueueUserId("  ").ok, false);
  assert.deepEqual(validateQueueUserId(" user-id "), { ok: true, userId: "user-id" });
  assert.equal(isIdempotencyKeyUniqueConflict({ code: "23505", message: "email_delivery_jobs_idempotency_unique" }), true);
  assert.equal(isIdempotencyKeyUniqueConflict({ code: "23505", message: "some_other_unique" }), false);
  assert.equal(isIdempotencyKeyUniqueConflict({ code: "42501", message: "idempotency_key" }), false);
});

function makeJob(overrides = {}) {
  return {
    id: "job-1",
    status: "processing",
    attempts: 0,
    max_attempts: 5,
    updated_at: "2026-08-22T00:00:00.000Z",
    locked_at: "2026-08-22T00:00:00.000Z",
    ...overrides,
  };
}

function sentResult() {
  return {
    provider: "resend",
    providerMessageId: "provider-message-1",
    status: "sent",
    acceptedAt: "2026-08-22T00:20:00.000Z",
    errorCode: null,
    errorMessage: null,
  };
}

function makeRuntimeDependencies(shared, overrides = {}) {
  return {
    now: overrides.now ?? (() => new Date()),
    loadJob: async () => ({ ok: true, job: { ...shared } }),
    resolveRecipient: async () => ({ ok: true, email: "masked-test@example.invalid" }),
    claimJob: async ({ job, attempts, claimedAt, triggerSource }) => {
      await new Promise((resolve) => setImmediate(resolve));
      if (shared.status !== job.status || shared.updated_at !== job.updated_at || shared.locked_at !== job.locked_at) {
        return { ok: true, claimed: false };
      }
      shared.status = "processing";
      shared.attempts = attempts;
      shared.updated_at = claimedAt.toISOString();
      shared.locked_at = claimedAt.toISOString();
      shared.locked_by = triggerSource;
      return { ok: true, claimed: true };
    },
    send: overrides.send ?? (async () => sentResult()),
    finalizeJob: async ({ result, outcome, completedAt }) => {
      shared.status = outcome.status;
      shared.provider = result.provider;
      shared.provider_message_id = result.providerMessageId;
      shared.next_retry_at = outcome.nextRetryAt;
      shared.sent_at = outcome.sentAt;
      shared.updated_at = completedAt.toISOString();
      shared.locked_at = null;
      shared.locked_by = null;
      return { ok: true, job: { ...shared } };
    },
    recordAttempt: overrides.recordAttempt ?? (async () => ({ ok: true })),
    warn: () => {},
    computeNextRetryAt: () => "2026-08-22T00:21:00.000Z",
    isRetryableError: () => true,
  };
}
