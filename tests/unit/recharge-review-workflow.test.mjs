import assert from "node:assert/strict";
import test from "node:test";

import {
  acquireExactRechargeState,
  classifyApproveProgress,
  buildRechargeReviewErrorContract,
  classifyCreditFailureCasMiss,
  classifyPostRpcStatus,
  classifyUnknownRechargeCreditOutcome,
  executeAuditedRechargeTransition,
  executeCreditFailureTransition,
  executePaidCompletionRepair,
  executeRechargeCreditAttempt,
  getRechargeReviewActionContract,
  parseRechargeCreditRpcResult,
} from "../../lib/recharges/review-workflow.mjs";

test("review actions expose exact source-state contracts", () => {
  assert.deepEqual(
    getRechargeReviewActionContract("approve", "reviewing"),
    { from: "reviewing", to: "approved" },
  );
  assert.equal(
    getRechargeReviewActionContract("approve", "processing"),
    null,
  );
  assert.deepEqual(
    getRechargeReviewActionContract("retry_credit", "approved"),
    { from: "approved", to: "processing" },
  );
  assert.deepEqual(
    getRechargeReviewActionContract("retry_credit", "failed"),
    { from: "failed", to: "processing" },
  );
  assert.equal(
    getRechargeReviewActionContract("retry_credit", "processing"),
    null,
  );

  for (const [action, from, to] of [
    ["start_review", "submitted", "reviewing"],
    ["reject", "reviewing", "rejected"],
    ["request_more_proof", "reviewing", "submitted"],
    ["cancel", "waiting_payment", "cancelled"],
  ]) {
    assert.deepEqual(
      getRechargeReviewActionContract(action, from),
      { from, to },
    );
  }
});

test("review error contracts preserve uncertain fields and map conflict versus input status", () => {
  const uncertain = buildRechargeReviewErrorContract({
    message: "请人工核对，禁止重复操作。",
    code: "RECHARGE_REVIEW_OUTCOME_UNCERTAIN",
    status: 409,
    outcome: "uncertain",
    idempotent: false,
    requiresManualReconciliation: true,
    knownStatus: "processing",
  }, "req-uncertain");
  assert.equal(uncertain.status, 409);
  assert.deepEqual(uncertain.body, {
    error: "请人工核对，禁止重复操作。",
    safeMessage: "请人工核对，禁止重复操作。",
    code: "RECHARGE_REVIEW_OUTCOME_UNCERTAIN",
    requestId: "req-uncertain",
    outcome: "uncertain",
    idempotent: false,
    requiresManualReconciliation: true,
    knownStatus: "processing",
  });

  const invalid = buildRechargeReviewErrorContract({
    message: "参数无效。",
    code: "RECHARGE_REVIEW_INVALID",
    status: 400,
    outcome: "failed",
  }, "req-invalid");
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.requiresManualReconciliation, false);
});

test("two concurrent approve claims allow only one exact CAS owner", async () => {
  let status = "reviewing";
  const compareAndSet = async (expectedStatus) => {
    if (status !== expectedStatus) return null;
    status = "approved";
    return { id: "recharge-1", status };
  };
  const readLatest = async () => ({ id: "recharge-1", status });

  const results = await Promise.all([
    acquireExactRechargeState({
      expectedStatus: "reviewing",
      compareAndSet,
      readLatest,
    }),
    acquireExactRechargeState({
      expectedStatus: "reviewing",
      compareAndSet,
      readLatest,
    }),
  ]);

  assert.equal(results.filter((result) => result.kind === "acquired").length, 1);
  assert.equal(results.filter((result) => result.kind === "conflict").length, 1);
  assert.equal(status, "approved");
});

test("approve and retry credit cannot move an owned processing row back to approved", async () => {
  let status = "approved";
  const compareAndSet = async (expectedStatus) => {
    if (status !== expectedStatus) return null;
    status = "processing";
    return { id: "recharge-1", status };
  };
  const readLatest = async () => ({ id: "recharge-1", status });

  const retry = await acquireExactRechargeState({
    expectedStatus: "approved",
    compareAndSet,
    readLatest,
  });
  const competingApprove = await acquireExactRechargeState({
    expectedStatus: "approved",
    compareAndSet,
    readLatest,
  });

  assert.equal(retry.kind, "acquired");
  assert.equal(competingApprove.kind, "in_progress");
  assert.equal(status, "processing");
});

test("CAS misses classify succeeded as idempotent and processing as conflict", async () => {
  for (const [status, expectedKind] of [
    ["succeeded", "completed"],
    ["paid", "repair_paid"],
    ["processing", "in_progress"],
  ]) {
    const result = await acquireExactRechargeState({
      expectedStatus: "reviewing",
      compareAndSet: async () => null,
      readLatest: async () => ({ status }),
    });
    assert.equal(result.kind, expectedKind);
  }
});

test("audited transitions write intent before CAS and completion after CAS", async () => {
  const calls = [];
  const result = await executeAuditedRechargeTransition({
    expectedStatus: "submitted",
    writeIntent: async () => calls.push("intent"),
    compareAndSet: async () => {
      calls.push("cas");
      return { status: "reviewing" };
    },
    readLatest: async () => ({ status: "submitted" }),
    writeCompleted: async () => calls.push("completed"),
  });

  assert.equal(result.kind, "acquired");
  assert.deepEqual(calls, ["intent", "cas", "completed"]);
});

test("intent failure stops state changes and completion failure reports partial success", async () => {
  let casCalls = 0;
  const intentFailure = await executeAuditedRechargeTransition({
    expectedStatus: "submitted",
    writeIntent: async () => { throw new Error("audit unavailable"); },
    compareAndSet: async () => { casCalls += 1; return null; },
    readLatest: async () => ({ status: "submitted" }),
    writeCompleted: async () => undefined,
  });
  assert.equal(intentFailure.kind, "intent_audit_failed");
  assert.equal(casCalls, 0);

  const completionFailure = await executeAuditedRechargeTransition({
    expectedStatus: "submitted",
    writeIntent: async () => undefined,
    compareAndSet: async () => ({ status: "reviewing" }),
    readLatest: async () => ({ status: "submitted" }),
    writeCompleted: async () => { throw new Error("audit unavailable"); },
  });
  assert.equal(completionFailure.kind, "completion_audit_failed");
  assert.equal(completionFailure.row.status, "reviewing");
});

test("approve progress reports partial success after approval and uncertain after processing", () => {
  assert.deepEqual(classifyApproveProgress({
    approvalStateChanged: true,
    processingClaimed: false,
    rpcAttempted: false,
    rpcMayHaveSucceeded: false,
  }), {
    outcome: "partial_success",
    knownStatus: "approved",
    requiresManualReconciliation: true,
  });
  assert.deepEqual(classifyApproveProgress({
    approvalStateChanged: true,
    processingClaimed: true,
    rpcAttempted: false,
    rpcMayHaveSucceeded: false,
  }), {
    outcome: "uncertain",
    knownStatus: "processing",
    requiresManualReconciliation: true,
  });
});

test("reviewing to approved followed by credit-intent failure is partial and must reconcile", async () => {
  let status = "reviewing";
  const approval = await executeAuditedRechargeTransition({
    expectedStatus: "reviewing",
    writeIntent: async () => undefined,
    compareAndSet: async () => {
      status = "approved";
      return { status };
    },
    readLatest: async () => ({ status }),
    writeCompleted: async () => undefined,
  });
  assert.equal(approval.kind, "acquired");

  let processingCasCalls = 0;
  const creditClaim = await executeAuditedRechargeTransition({
    expectedStatus: "approved",
    writeIntent: async () => { throw new Error("credit intent unavailable"); },
    compareAndSet: async () => { processingCasCalls += 1; return null; },
    readLatest: async () => ({ status }),
    writeCompleted: async () => undefined,
  });
  const decision = classifyApproveProgress({
    approvalStateChanged: approval.row.status === "approved",
    processingClaimed: false,
    rpcAttempted: false,
    rpcMayHaveSucceeded: false,
  });
  assert.equal(creditClaim.kind, "intent_audit_failed");
  assert.equal(processingCasCalls, 0);
  assert.equal(decision.outcome, "partial_success");
  assert.equal(decision.requiresManualReconciliation, true);
});

test("post-RPC decisions never downgrade paid or succeeded", () => {
  assert.equal(classifyPostRpcStatus("paid"), "repair_paid");
  assert.equal(classifyPostRpcStatus("succeeded"), "completed");
  assert.equal(classifyPostRpcStatus("processing"), "uncertain");
  assert.equal(classifyCreditFailureCasMiss("paid"), "repair_paid");
  assert.equal(classifyCreditFailureCasMiss("succeeded"), "completed");
  assert.equal(classifyCreditFailureCasMiss("processing"), "in_progress");
});

test("paid completion repair changes state before writing success audit", async () => {
  const calls = [];
  const result = await executePaidCompletionRepair({
    compareAndSet: async () => {
      calls.push("paid_to_succeeded");
      return { status: "succeeded" };
    },
    readLatest: async () => {
      calls.push("read_latest");
      return { status: "succeeded" };
    },
    writeCompleted: async () => calls.push("credit_succeeded"),
  });
  assert.equal(result.kind, "completed");
  assert.deepEqual(calls, ["paid_to_succeeded", "credit_succeeded"]);
});

test("failed paid repair leaves no success event and audit failure never downgrades state", async () => {
  let successEvents = 0;
  const failedRepair = await executePaidCompletionRepair({
    compareAndSet: async () => null,
    readLatest: async () => ({ status: "paid" }),
    writeCompleted: async () => { successEvents += 1; },
  });
  assert.equal(failedRepair.kind, "uncertain");
  assert.equal(successEvents, 0);

  const auditFailure = await executePaidCompletionRepair({
    compareAndSet: async () => ({ status: "succeeded" }),
    readLatest: async () => ({ status: "succeeded" }),
    writeCompleted: async () => { throw new Error("audit unavailable"); },
  });
  assert.equal(auditFailure.kind, "completion_audit_failed");
  assert.equal(auditFailure.row.status, "succeeded");
});

test("paid repair CAS loser observes succeeded without writing a success event", async () => {
  let successEvents = 0;
  const result = await executePaidCompletionRepair({
    compareAndSet: async () => null,
    readLatest: async () => ({ status: "succeeded" }),
    writeCompleted: async () => { successEvents += 1; },
  });
  assert.equal(result.kind, "already_completed");
  assert.equal(successEvents, 0);
});

test("paid repair transport uncertainty that observes succeeded remains uncertain", async () => {
  let successEvents = 0;
  let casCalls = 0;
  let reads = 0;
  const result = await executePaidCompletionRepair({
    compareAndSet: async () => {
      casCalls += 1;
      throw new Error("response lost after paid repair may have committed");
    },
    readLatest: async () => {
      reads += 1;
      return { status: "succeeded" };
    },
    writeCompleted: async () => { successEvents += 1; },
  });

  assert.equal(result.kind, "uncertain_succeeded");
  assert.equal(result.row.status, "succeeded");
  assert.equal(casCalls, 1);
  assert.equal(reads, 1);
  assert.equal(successEvents, 0);
});

test("paid repair tagged uncertainty is distinct from a definite CAS loser", async () => {
  let successEvents = 0;
  const uncertain = await executePaidCompletionRepair({
    compareAndSet: async () => ({
      kind: "uncertain",
      row: { status: "succeeded" },
    }),
    readLatest: async () => { throw new Error("must not read twice"); },
    writeCompleted: async () => { successEvents += 1; },
  });
  const loser = await executePaidCompletionRepair({
    compareAndSet: async () => ({ kind: "not_updated", row: null }),
    readLatest: async () => ({ status: "succeeded" }),
    writeCompleted: async () => { successEvents += 1; },
  });

  assert.equal(uncertain.kind, "uncertain_succeeded");
  assert.equal(loser.kind, "already_completed");
  assert.notEqual(uncertain.kind, loser.kind);
  assert.equal(successEvents, 0);
});

test("uncertain succeeded response contract requires manual reconciliation", () => {
  const response = buildRechargeReviewErrorContract({
    message: "充值当前显示为已完成，但最终状态更新和 completion 审计无法确认，禁止重复入账或修复。",
    code: "RECHARGE_REVIEW_OUTCOME_UNCERTAIN",
    status: 409,
    outcome: "uncertain",
    idempotent: false,
    requiresManualReconciliation: true,
    knownStatus: "succeeded",
  }, "req-paid-repair-unknown");

  assert.equal(response.status, 409);
  assert.equal(response.body.code, "RECHARGE_REVIEW_OUTCOME_UNCERTAIN");
  assert.equal(response.body.outcome, "uncertain");
  assert.equal(response.body.requestId, "req-paid-repair-unknown");
  assert.equal(response.body.idempotent, false);
  assert.equal(response.body.requiresManualReconciliation, true);
  assert.match(response.body.safeMessage, /已完成/);
  assert.match(response.body.safeMessage, /审计/);
  assert.doesNotMatch(response.body.safeMessage, /message|details|hint/i);
});

test("credit failure events are written only after exact failure CAS succeeds", async () => {
  let failureEvents = 0;
  const missed = await executeCreditFailureTransition({
    markFailed: async () => null,
    readLatest: async () => ({ status: "succeeded" }),
    writeFailedEvent: async () => { failureEvents += 1; },
  });
  assert.equal(missed.kind, "completed");
  assert.equal(failureEvents, 0);

  const failed = await executeCreditFailureTransition({
    markFailed: async () => ({ status: "failed" }),
    readLatest: async () => ({ status: "processing" }),
    writeFailedEvent: async () => { failureEvents += 1; },
  });
  assert.equal(failed.kind, "failed");
  assert.equal(failureEvents, 1);
});

test("uncertain RPC outcome reconciles once and never invokes RPC twice", async () => {
  let rpcCalls = 0;
  let reconcileCalls = 0;
  const result = await executeRechargeCreditAttempt({
    invokeRpc: async () => {
      rpcCalls += 1;
      throw new Error("transport outcome unknown");
    },
    isExplicitFailure: () => false,
    handleExplicitFailure: async () => "explicit_failure",
    reconcileOutcome: async ({ kind }) => {
      reconcileCalls += 1;
      return kind;
    },
  });

  assert.equal(result, "unknown");
  assert.equal(rpcCalls, 1);
  assert.equal(reconcileCalls, 1);
});

test("explicit RPC failures use the controlled failure path", async () => {
  let failureCalls = 0;
  let reconcileCalls = 0;
  const result = await executeRechargeCreditAttempt({
    invokeRpc: async () => ({
      data: null,
      error: { code: "P0001", message: "internal database text" },
    }),
    isExplicitFailure: () => true,
    handleExplicitFailure: async () => {
      failureCalls += 1;
      return "failed";
    },
    reconcileOutcome: async () => {
      reconcileCalls += 1;
      return "reconciled";
    },
  });

  assert.equal(result, "failed");
  assert.equal(failureCalls, 1);
  assert.equal(reconcileCalls, 0);
});

test("successful RPC result is reconciled instead of being credited again", async () => {
  let rpcCalls = 0;
  const result = await executeRechargeCreditAttempt({
    invokeRpc: async () => {
      rpcCalls += 1;
      return {
        data: {
          ok: true,
          alreadyCompleted: false,
          rechargeNo: "R-1",
          transactionNo: "T-1",
        },
        error: null,
      };
    },
    isExplicitFailure: () => false,
    handleExplicitFailure: async () => "failed",
    reconcileOutcome: async ({ kind, result: rpcResult }) => ({
      kind,
      alreadyCompleted: rpcResult.alreadyCompleted,
    }),
  });

  assert.deepEqual(result, {
    kind: "succeeded",
    alreadyCompleted: false,
  });
  assert.equal(rpcCalls, 1);
});

test("credit RPC parser accepts only the complete runtime success contract", () => {
  assert.deepEqual(
    parseRechargeCreditRpcResult({
      ok: true,
      alreadyCompleted: false,
      rechargeNo: "R-1",
      transactionNo: "T-1",
    }),
    {
      kind: "success",
      alreadyCompleted: false,
      rechargeNo: "R-1",
      transactionNo: "T-1",
    },
  );
  assert.deepEqual(
    parseRechargeCreditRpcResult({
      ok: true,
      alreadyCompleted: true,
      rechargeNo: "R-1",
      transactionNo: null,
    }),
    {
      kind: "success",
      alreadyCompleted: true,
      rechargeNo: "R-1",
      transactionNo: null,
    },
  );
});

test("malformed credit RPC success shapes are unknown, never truthy success", () => {
  for (const value of [
    null,
    [],
    1,
    { ok: true, alreadyCompleted: "false", rechargeNo: "R-1", transactionNo: "T-1" },
    { ok: true, alreadyCompleted: false, rechargeNo: {}, transactionNo: "T-1" },
    { ok: true, alreadyCompleted: false, rechargeNo: "R-1", transactionNo: [] },
    { ok: true, alreadyCompleted: false, rechargeNo: "R-1" },
  ]) {
    assert.deepEqual(parseRechargeCreditRpcResult(value), { kind: "unknown" });
  }
});

test("malformed credit RPC result reconciles once without retry or failure transition", async () => {
  let rpcCalls = 0;
  let reconcileCalls = 0;
  let explicitFailureCalls = 0;
  const result = await executeRechargeCreditAttempt({
    invokeRpc: async () => {
      rpcCalls += 1;
      return {
        data: {
          ok: true,
          alreadyCompleted: "false",
          rechargeNo: "R-1",
          transactionNo: "T-1",
        },
        error: null,
      };
    },
    isExplicitFailure: () => false,
    handleExplicitFailure: async () => {
      explicitFailureCalls += 1;
      return "failed";
    },
    reconcileOutcome: async (outcome) => {
      reconcileCalls += 1;
      return outcome;
    },
  });

  assert.deepEqual(result, { kind: "unknown", result: null });
  assert.equal(rpcCalls, 1);
  assert.equal(reconcileCalls, 1);
  assert.equal(explicitFailureCalls, 0);
});

test("unknown credit RPC outcomes only repair paid and never grant processing ownership", () => {
  assert.equal(classifyUnknownRechargeCreditOutcome("succeeded"), "uncertain");
  assert.equal(classifyUnknownRechargeCreditOutcome("paid"), "repair_paid");
  assert.equal(classifyUnknownRechargeCreditOutcome("processing"), "uncertain");
  assert.equal(classifyUnknownRechargeCreditOutcome("failed"), "uncertain");
});
