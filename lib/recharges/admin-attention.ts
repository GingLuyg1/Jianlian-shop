const ACTIVE_REVIEW_STATUSES = new Set(["submitted", "reviewing", "approved", "failed"]);
const COMPLETED_RECHARGE_STATUSES = new Set(["paid", "succeeded"]);
const ROUTINE_EXPIRY_SUMMARY = /^(充值订单已过期|支付已过期|已超时过期)$/;

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function requiresRechargeAdminAttention(row: Record<string, unknown>) {
  const status = String(row.status ?? "").trim().toLowerCase();
  if (COMPLETED_RECHARGE_STATUSES.has(status)) return false;
  if (ACTIVE_REVIEW_STATUSES.has(status)) return true;

  const hasExceptionEvidence = hasText(row.exception_type) || hasText(row.error_summary);
  if (["pending", "waiting_payment"].includes(status)) return hasExceptionEvidence;

  const isManualFlow = String(row.review_mode ?? "").trim().toLowerCase() === "manual";
  const isClosedWithoutAdminAction = ["rejected", "cancelled", "expired"].includes(status);
  if (isClosedWithoutAdminAction) {
    const summary = String(row.error_summary ?? "").trim();
    return hasText(row.exception_type) || (hasText(summary) && !ROUTINE_EXPIRY_SUMMARY.test(summary));
  }
  return hasExceptionEvidence || (isManualFlow && !isClosedWithoutAdminAction);
}
