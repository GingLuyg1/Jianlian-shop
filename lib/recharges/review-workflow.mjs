export const RECHARGE_REVIEW_ACTION_CONTRACT = Object.freeze({
  start_review: Object.freeze({ from: ["submitted"], to: "reviewing" }),
  approve: Object.freeze({ from: ["reviewing"], to: "approved" }),
  reject: Object.freeze({ from: ["reviewing"], to: "rejected" }),
  request_more_proof: Object.freeze({ from: ["reviewing"], to: "submitted" }),
  cancel: Object.freeze({
    from: [
      "pending",
      "waiting_payment",
      "submitted",
      "reviewing",
      "rejected",
      "failed",
    ],
    to: "cancelled",
  }),
  retry_credit: Object.freeze({ from: ["approved", "failed"], to: "processing" }),
});

const COMPLETED_STATUSES = new Set(["paid", "succeeded"]);

export function getRechargeReviewActionContract(action, status) {
  const contract = RECHARGE_REVIEW_ACTION_CONTRACT[action];
  if (!contract || !contract.from.includes(status)) return null;
  return { from: status, to: contract.to };
}

export function classifyRechargeCasMiss(status) {
  if (status === "paid") return "repair_paid";
  if (status === "succeeded") return "completed";
  if (status === "processing") return "in_progress";
  return "conflict";
}

export function classifyPostRpcStatus(status) {
  if (status === "paid") return "repair_paid";
  if (status === "succeeded") return "completed";
  return "uncertain";
}

export function classifyUnknownRechargeCreditOutcome(status) {
  if (status === "paid") return "repair_paid";
  return "uncertain";
}

export function classifyCreditFailureCasMiss(status) {
  if (status === "paid") return "repair_paid";
  if (status === "succeeded") return "completed";
  if (status === "processing") return "in_progress";
  if (status === "approved" || status === "failed") return "retryable_state";
  return "conflict";
}

export function isRechargeCompletedStatus(status) {
  return COMPLETED_STATUSES.has(status);
}

export function classifyApproveProgress(progress) {
  if (progress?.processingClaimed || progress?.rpcAttempted || progress?.rpcMayHaveSucceeded) {
    return {
      outcome: "uncertain",
      knownStatus: "processing",
      requiresManualReconciliation: true,
    };
  }
  if (progress?.approvalStateChanged) {
    return {
      outcome: "partial_success",
      knownStatus: "approved",
      requiresManualReconciliation: true,
    };
  }
  return {
    outcome: "failed",
    knownStatus: null,
    requiresManualReconciliation: false,
  };
}

export function buildRechargeReviewErrorContract(error, requestId) {
  const safeMessage = typeof error?.message === "string"
    ? error.message.slice(0, 500)
    : "充值审核操作失败。";
  return {
    status: error.status,
    body: {
      error: safeMessage,
      safeMessage,
      code: error.code,
      requestId,
      outcome: error.outcome,
      idempotent: error.idempotent === true,
      requiresManualReconciliation:
        error.requiresManualReconciliation === true,
      knownStatus: error.knownStatus ?? null,
    },
  };
}

export async function acquireExactRechargeState({
  expectedStatus,
  compareAndSet,
  readLatest,
}) {
  let updated;
  try {
    updated = await compareAndSet(expectedStatus);
  } catch {
    try {
      const latest = await readLatest();
      if (latest?.status === "succeeded") return { kind: "completed", row: latest };
      if (latest?.status === "paid") return { kind: "repair_paid", row: latest };
      return { kind: "write_outcome_uncertain", row: latest };
    } catch {
      return { kind: "write_outcome_uncertain", row: null };
    }
  }

  if (updated?.kind === "updated") {
    return { kind: "acquired", row: updated.row };
  }
  if (updated?.kind === "uncertain") {
    if (updated.row?.status === "succeeded") {
      return { kind: "completed", row: updated.row };
    }
    if (updated.row?.status === "paid") {
      return { kind: "repair_paid", row: updated.row };
    }
    return { kind: "write_outcome_uncertain", row: updated.row ?? null };
  }
  if (updated && updated.kind !== "not_updated") {
    return { kind: "acquired", row: updated };
  }

  let latest;
  try {
    latest = await readLatest();
  } catch {
    return { kind: "write_outcome_uncertain", row: null };
  }
  return {
    kind: classifyRechargeCasMiss(String(latest?.status ?? "")),
    row: latest,
  };
}

export async function executeAuditedRechargeTransition({
  expectedStatus,
  writeIntent,
  compareAndSet,
  readLatest,
  writeCompleted,
}) {
  try {
    await writeIntent();
  } catch (error) {
    return { kind: "intent_audit_failed", error };
  }

  const claim = await acquireExactRechargeState({
    expectedStatus,
    compareAndSet,
    readLatest,
  });
  if (claim.kind !== "acquired") return claim;

  try {
    await writeCompleted(claim.row);
  } catch (error) {
    return {
      kind: "completion_audit_failed",
      row: claim.row,
      error,
    };
  }

  return claim;
}

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function parseRechargeCreditRpcResult(value) {
  if (
    !isPlainRecord(value)
    || value.ok !== true
    || typeof value.alreadyCompleted !== "boolean"
    || typeof value.rechargeNo !== "string"
    || (
      typeof value.transactionNo !== "string"
      && value.transactionNo !== null
    )
  ) {
    return { kind: "unknown" };
  }

  return {
    kind: "success",
    alreadyCompleted: value.alreadyCompleted,
    rechargeNo: value.rechargeNo,
    transactionNo: value.transactionNo,
  };
}

export async function executeRechargeCreditAttempt({
  invokeRpc,
  isExplicitFailure,
  reconcileOutcome,
  handleExplicitFailure,
}) {
  let response;
  try {
    response = await invokeRpc();
  } catch {
    return reconcileOutcome({ kind: "unknown", result: null });
  }

  if (response?.error) {
    if (isExplicitFailure(response.error)) {
      return handleExplicitFailure(response.error);
    }
    return reconcileOutcome({ kind: "unknown", result: null });
  }

  const parsed = parseRechargeCreditRpcResult(response?.data);
  if (parsed.kind !== "success") {
    return reconcileOutcome({ kind: "unknown", result: null });
  }

  return reconcileOutcome({
    kind: "succeeded",
    result: parsed,
  });
}

export async function executePaidCompletionRepair({
  compareAndSet,
  readLatest,
  writeCompleted,
}) {
  let repaired;
  try {
    repaired = await compareAndSet();
  } catch {
    try {
      const latest = await readLatest();
      return latest?.status === "succeeded"
        ? { kind: "uncertain_succeeded", row: latest }
        : { kind: "uncertain", row: latest };
    } catch {
      return { kind: "uncertain", row: null };
    }
  }

  if (repaired?.kind === "uncertain") {
    return repaired.row?.status === "succeeded"
      ? { kind: "uncertain_succeeded", row: repaired.row }
      : { kind: "uncertain", row: repaired.row ?? null };
  }
  const ownedRow = repaired?.kind === "updated" ? repaired.row : repaired;
  if (!ownedRow || repaired?.kind === "not_updated") {
    let latest;
    try {
      latest = await readLatest();
    } catch {
      return { kind: "uncertain", row: null };
    }
    return latest?.status === "succeeded"
      ? { kind: "already_completed", row: latest }
      : { kind: "uncertain", row: latest };
  }
  if (ownedRow.status !== "succeeded") {
    return { kind: "uncertain", row: ownedRow };
  }
  try {
    await writeCompleted(ownedRow);
  } catch (error) {
    return {
      kind: "completion_audit_failed",
      row: ownedRow,
      error,
    };
  }
  return { kind: "completed", row: ownedRow };
}

export async function executeCreditFailureTransition({
  markFailed,
  readLatest,
  writeFailedEvent,
}) {
  let failed;
  try {
    failed = await markFailed();
  } catch {
    try {
      return { kind: "write_outcome_uncertain", row: await readLatest() };
    } catch {
      return { kind: "write_outcome_uncertain", row: null };
    }
  }
  if (failed?.kind === "uncertain") {
    return { kind: "write_outcome_uncertain", row: failed.row ?? null };
  }
  const failedRow = failed?.kind === "updated" ? failed.row : failed;
  if (!failedRow || failed?.kind === "not_updated") {
    let latest;
    try {
      latest = await readLatest();
    } catch {
      return { kind: "write_outcome_uncertain", row: null };
    }
    return {
      kind: classifyCreditFailureCasMiss(
        String(latest?.status ?? ""),
      ),
      row: latest,
    };
  }
  try {
    await writeFailedEvent(failedRow);
  } catch (error) {
    return {
      kind: "completion_audit_failed",
      row: failedRow,
      error,
    };
  }
  return { kind: "failed", row: failedRow };
}
