const TERMINAL_ORDER_STATUSES = new Set(["paid", "delivered", "completed", "expired", "failed", "cancelled"]);
const TERMINAL_CHAIN_STATUSES = new Set(["paid", "expired", "payment_failed"]);
const CONFIRMATION_STATUSES = new Set(["submitted", "confirming"]);
const COUNTDOWN_STATUSES = new Set(["waiting_payment", "submitted", "confirming"]);

function hasValidTxHash(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(value ?? "");
}

export function getBep20TimingVisibility(input) {
  const chainStatus = String(input?.chainStatus ?? "").toLowerCase();
  const orderStatus = String(input?.orderStatus ?? "").toLowerCase();
  const paymentStatus = String(input?.paymentStatus ?? "").toLowerCase();
  const paymentAction = String(input?.paymentAction ?? "").toLowerCase();
  const manualReview = chainStatus === "manual_review";
  const terminal = paymentStatus === "paid"
    || paymentAction === "paid"
    || TERMINAL_ORDER_STATUSES.has(orderStatus)
    || TERMINAL_CHAIN_STATUSES.has(chainStatus);
  const hasSubmittedTxHash = hasValidTxHash(input?.submittedTxHash);

  return {
    showCountdown: !manualReview && !terminal && COUNTDOWN_STATUSES.has(chainStatus),
    showConfirmationProgress:
      !manualReview && !terminal && hasSubmittedTxHash && CONFIRMATION_STATUSES.has(chainStatus),
    hasSubmittedTxHash,
    manualReview,
    terminal,
  };
}
