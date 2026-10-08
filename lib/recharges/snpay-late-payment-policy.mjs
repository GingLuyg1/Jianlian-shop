// Dedicated manual exception only. Never imported by callback/recovery/timers.
export const LATE_PAYMENT_EXCEPTION = "snpay_late_payment_manual_v1";

export function latePaymentFailure(code) {
  const error = new Error("过期付款核验未通过，请人工核对；未授权自动入账。");
  error.code = code;
  error.requiresManualReconciliation = true;
  return error;
}

function requireCondition(value, code) {
  if (!value) throw latePaymentFailure(code);
}

export function principalMinorUnits(value) {
  const text = String(value ?? "");
  requireCondition(/^\d+(?:\.\d{1,6})?$/.test(text), "LATE_PAYMENT_AMOUNT_INVALID");
  const [whole, fraction = ""] = text.split(".");
  requireCondition(!/[1-9]/.test(fraction.slice(2)), "LATE_PAYMENT_AMOUNT_PRECISION");
  const cents = BigInt(whole) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, "0"));
  requireCondition(cents > 0n && cents <= 999999999999n, "LATE_PAYMENT_AMOUNT_INVALID");
  return cents;
}

export function validateLatePaymentReason(reason) {
  requireCondition(typeof reason === "string" && reason.trim().length > 0 && reason.length <= 500,
    "LATE_PAYMENT_REASON_REQUIRED");
  // Do not persist accidentally pasted credentials or authenticated URLs.
  requireCondition(!/sb_secret_|eyJ[a-zA-Z0-9_-]{20}|-----BEGIN|https?:\/\/|(?:secret|token|signature|merchant.?key)\s*[:=]/i.test(reason),
    "LATE_PAYMENT_REASON_UNSAFE");
  return reason.trim();
}

export function pinLatePaymentContext(recharge, sessions, ledger) {
  requireCondition(recharge && recharge.provider === "snpay"
    && ["alipay", "wechat"].includes(recharge.channel_code) && recharge.currency === "CNY",
  "LATE_PAYMENT_RECHARGE_UNSUPPORTED");
  const repeat = recharge.status === "succeeded" && recharge.exception_type === LATE_PAYMENT_EXCEPTION;
  requireCondition(recharge.status === "expired" || repeat, "LATE_PAYMENT_STATUS_INVALID");
  const candidates = sessions.filter(s => s.provider === "snpay" && Boolean(s.provider_order_no));
  requireCondition(candidates.length === 1, "LATE_PAYMENT_SESSION_AMBIGUOUS");
  const session = candidates[0];
  requireCondition(session.business_type === "recharge" && session.business_id === recharge.id
    && session.business_no === recharge.recharge_no && session.user_id === recharge.user_id
    && session.channel_code === recharge.channel_code && session.currency === "CNY"
    && session.session_no && session.id && session.expires_at && recharge.expires_at
    && (session.status === "expired" || (repeat && session.status === "paid")),
  "LATE_PAYMENT_SESSION_IDENTITY_INVALID");
  const principal = principalMinorUnits(recharge.payable_amount);
  requireCondition(principalMinorUnits(recharge.amount) === principal
    && principalMinorUnits(recharge.requested_amount) === principal
    && principalMinorUnits(session.payable_amount) === principal,
  "LATE_PAYMENT_PRINCIPAL_MISMATCH");
  const completed = ledger.filter(x => x.status === "completed");
  if (repeat) {
    requireCondition(principalMinorUnits(recharge.credited_amount) === principal && recharge.completed_at
      && completed.length === 1 && completed[0].direction === "credit"
      && completed[0].business_type === "account_recharge"
      && completed[0].business_id === recharge.recharge_no && completed[0].user_id === recharge.user_id
      && principalMinorUnits(completed[0].amount) === principal,
    "LATE_PAYMENT_EXISTING_CREDIT_CONFLICT");
  } else {
    requireCondition(Number(recharge.credited_amount) === 0 && !recharge.completed_at && completed.length === 0,
      "LATE_PAYMENT_EXISTING_CREDIT_CONFLICT");
  }
  return { recharge, session, principal: Number(principal) / 100, repeat };
}

export function validateLatePaymentEvidence(context, query, now = Date.now()) {
  const { recharge: r, session: s } = context;
  requireCondition(query?.found === true && query?.paid === true && query.status === "paid",
    "LATE_PAYMENT_PROVIDER_NOT_PAID");
  requireCondition(query.rawSummarySafe?.signatureVerified === true
    && query.providerTransactionId === s.provider_order_no
    && query.providerChannel === s.channel_code && query.currency === "CNY",
  "LATE_PAYMENT_PROVIDER_IDENTITY_INVALID");
  requireCondition(principalMinorUnits(query.amount) === principalMinorUnits(r.payable_amount),
    "LATE_PAYMENT_PROVIDER_AMOUNT_MISMATCH");
  requireCondition(typeof query.paidAt === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(query.paidAt),
    "LATE_PAYMENT_PAID_AT_INVALID");
  const paid = Date.parse(query.paidAt);
  const boundaries = [r.created_at, s.created_at, r.expires_at, s.expires_at].map(Date.parse);
  requireCondition(Number.isFinite(paid) && boundaries.every(Number.isFinite)
    && paid > boundaries[0] && paid > boundaries[1] && paid <= now + 300000,
  "LATE_PAYMENT_PAID_AT_INVALID");
  requireCondition(paid > boundaries[2] && paid > boundaries[3], "LATE_PAYMENT_NOT_AFTER_EXPIRY");
  return {
    provider: "snpay", channel: s.channel_code, principalAmount: context.principal,
    providerOrderPresent: true, providerPaidAt: query.paidAt, expiresAt: r.expires_at,
    paidAfterExpirySeconds: Math.floor((paid - boundaries[2]) / 1000),
  };
}
