import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRechargePublicFailure,
  buildRechargeSafeLogFields,
} from "../../lib/payments/recharge-api-failure.mjs";
import { executeRechargeWriteCas } from "../../lib/recharges/review-adapter.mjs";
import {
  acquireExactRechargeState,
  executePaidCompletionRepair,
} from "../../lib/recharges/review-workflow.mjs";
import { decideRechargeReviewActionResponse } from "../../lib/recharges/review-ui-state.mjs";

test("write CAS that may have committed before a thrown response is uncertain", async () => {
  let status = "approved";
  let writes = 0;
  const result = await executeRechargeWriteCas({
    executeWrite: async () => {
      writes += 1;
      status = "processing";
      throw new Error("response lost after commit");
    },
    readLatest: async () => ({ id: "r1", status }),
    parseRow: (row) => row,
  });

  assert.deepEqual(result, {
    kind: "uncertain",
    row: { id: "r1", status: "processing" },
  });
  assert.equal(writes, 1);
});

test("uncertain CAS reconciled to succeeded is idempotently completed", async () => {
  const result = await acquireExactRechargeState({
    expectedStatus: "approved",
    compareAndSet: async () => ({
      kind: "uncertain",
      row: { id: "r1", status: "succeeded" },
    }),
    readLatest: async () => {
      throw new Error("must not read twice");
    },
  });
  assert.equal(result.kind, "completed");
  assert.equal(result.row.status, "succeeded");
});

test("uncertain CAS reconciled to processing never grants RPC ownership", async () => {
  const result = await acquireExactRechargeState({
    expectedStatus: "approved",
    compareAndSet: async () => ({
      kind: "uncertain",
      row: { id: "r1", status: "processing" },
    }),
    readLatest: async () => ({ id: "r1", status: "processing" }),
  });
  assert.equal(result.kind, "write_outcome_uncertain");
  assert.notEqual(result.kind, "acquired");
});

test("concurrent paid repair writes completion only for the CAS owner", async () => {
  let status = "paid";
  let completionEvents = 0;
  const repair = () => executePaidCompletionRepair({
    compareAndSet: async () => {
      if (status !== "paid") return { kind: "not_updated", row: null };
      status = "succeeded";
      return { kind: "updated", row: { id: "r1", status } };
    },
    readLatest: async () => ({ id: "r1", status }),
    writeCompleted: async () => { completionEvents += 1; },
  });

  const results = await Promise.all([repair(), repair()]);
  assert.equal(results.filter((result) => result.kind === "completed").length, 1);
  assert.equal(results.filter((result) => result.kind === "already_completed").length, 1);
  assert.equal(completionEvents, 1);
});

test("paid repair response loss after commit never impersonates a definite CAS loser", async () => {
  let status = "paid";
  let writes = 0;
  let completionEvents = 0;
  const result = await executePaidCompletionRepair({
    compareAndSet: () => executeRechargeWriteCas({
      executeWrite: async () => {
        writes += 1;
        status = "succeeded";
        throw new Error("response lost after commit");
      },
      readLatest: async () => ({ id: "r1", status }),
      parseRow: (row) => row,
    }),
    readLatest: async () => ({ id: "r1", status }),
    writeCompleted: async () => { completionEvents += 1; },
  });

  assert.equal(result.kind, "uncertain_succeeded");
  assert.equal(result.row.status, "succeeded");
  assert.equal(writes, 1);
  assert.equal(completionEvents, 0);
  assert.equal(status, "succeeded");
});

test("paid repair transport uncertainty that still reads paid is never replayed", async () => {
  let writes = 0;
  let completionEvents = 0;
  const result = await executePaidCompletionRepair({
    compareAndSet: () => executeRechargeWriteCas({
      executeWrite: async () => {
        writes += 1;
        throw new Error("transport interrupted before outcome was known");
      },
      readLatest: async () => ({ id: "r1", status: "paid" }),
      parseRow: (row) => row,
    }),
    readLatest: async () => ({ id: "r1", status: "paid" }),
    writeCompleted: async () => { completionEvents += 1; },
  });

  assert.equal(result.kind, "uncertain");
  assert.equal(result.row.status, "paid");
  assert.equal(writes, 1);
  assert.equal(completionEvents, 0);
});

test("public recharge failures expose fixed fields and whitelist logs", () => {
  const original = {
    code: "42501",
    message: "permission denied for table account_recharges",
    details: "secret detail",
    hint: "private hint",
  };
  const failure = buildRechargePublicFailure("create", "req-1");
  const serialized = JSON.stringify(failure.body);
  assert.equal(failure.body.code, "RECHARGE_CREATE_FAILED");
  assert.equal(failure.body.requestId, "req-1");
  assert.doesNotMatch(serialized, /permission denied|account_recharges|secret detail|private hint/i);

  const logFields = buildRechargeSafeLogFields({
    operation: "create",
    requestId: "req-1",
    status: 503,
    error: original,
  });
  assert.deepEqual(logFields, {
    operation: "create",
    requestId: "req-1",
    status: 503,
    databaseCode: "42501",
  });
});

test("UI decision keeps uncertain diagnostics and disables retries", () => {
  const decision = decideRechargeReviewActionResponse({
    ok: false,
    status: 409,
    payload: {
      code: "RECHARGE_REVIEW_OUTCOME_UNCERTAIN",
      outcome: "uncertain",
      requestId: "diag-1",
      idempotent: false,
      requiresManualReconciliation: true,
      error: "请人工核对。",
    },
  });
  assert.equal(decision.reconciliationRequired, true);
  assert.equal(decision.disableWrites, true);
  assert.equal(decision.shouldReload, true);
  assert.equal(decision.requestId, "diag-1");
});

test("UI decision treats idempotent completion as success, not retry error", () => {
  const decision = decideRechargeReviewActionResponse({
    ok: true,
    status: 200,
    payload: {
      outcome: "idempotent",
      idempotent: true,
      requestId: "diag-2",
    },
  });
  assert.equal(decision.kind, "idempotent");
  assert.equal(decision.reconciliationRequired, false);
  assert.equal(decision.shouldReload, true);
});
