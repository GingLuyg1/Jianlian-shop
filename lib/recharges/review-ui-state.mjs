const MANUAL_RECONCILIATION_CODE = "RECHARGE_REVIEW_OUTCOME_UNCERTAIN";

function safeText(value, fallback) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 500)
    : fallback;
}

export function decideRechargeReviewActionResponse({ ok, status, payload }) {
  const body = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload
    : {};
  const requestId = safeText(body.requestId, "");
  const outcome = safeText(body.outcome, ok ? "completed" : "failed");
  const code = safeText(body.code, ok ? "RECHARGE_REVIEW_COMPLETED" : "RECHARGE_REVIEW_FAILED");
  const message = safeText(
    body.safeMessage ?? body.error ?? body.message,
    ok ? "充值审核操作已完成。" : "充值审核操作失败。",
  );
  const requiresManualReconciliation = body.requiresManualReconciliation === true
    || outcome === "uncertain"
    || outcome === "partial_success"
    || code === MANUAL_RECONCILIATION_CODE;

  if (requiresManualReconciliation) {
    return {
      kind: "manual_reconciliation",
      code,
      outcome,
      requestId,
      message,
      reconciliationRequired: true,
      shouldReload: true,
      disableWrites: true,
      idempotent: false,
    };
  }
  if (status === 409) {
    return {
      kind: "conflict",
      code,
      outcome: "conflict",
      requestId,
      message: "充值记录状态已变化，已刷新最新状态，请勿重复执行原操作。",
      reconciliationRequired: false,
      shouldReload: true,
      disableWrites: false,
      idempotent: false,
    };
  }
  if (ok && body.idempotent === true) {
    return {
      kind: "idempotent",
      code,
      outcome: "idempotent",
      requestId,
      message: "该充值已经完成，本次未重复处理。",
      reconciliationRequired: false,
      shouldReload: true,
      disableWrites: false,
      idempotent: true,
    };
  }
  return {
    kind: ok ? "completed" : "failed",
    code,
    outcome,
    requestId,
    message,
    reconciliationRequired: false,
    shouldReload: ok,
    disableWrites: false,
    idempotent: body.idempotent === true,
  };
}
