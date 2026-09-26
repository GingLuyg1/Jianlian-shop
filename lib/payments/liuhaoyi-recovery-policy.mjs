import { liuhaoyiPaidTimeMs } from "./providers/liuhaoyi-core.mjs";

export { liuhaoyiPaidTimeMs };
export const LIUHAOYI_ALIPAY_RECHARGE_RECOVERY_MODE =
  "alipay_account_recharge_v1";
export const LIUHAOYI_WECHAT_RECHARGE_RECOVERY_MODE =
  "wechat_account_recharge_v1";

export const LIUHAOYI_RECOVERY_MINIMUM_AGE_MS = 30_000;
export const LIUHAOYI_ALIPAY_RECOVERY_MINIMUM_AGE_MS = 60_000;
export const LIUHAOYI_RECOVERY_EXPIRY_MARGIN_MS = 5_000;

export function isExplicitLiuhaoyiRecoveryExecution(value) {
  return value === true;
}

const ACTIVE_SESSION_STATUSES = new Set(["pending", "processing"]);
const ACTIVE_RECHARGE_STATUSES = new Set([
  "pending",
  "waiting_payment",
  "processing",
]);

export function evaluateLiuhaoyiAlipayRechargeRecovery({
  session,
  recharge,
  provider,
  nowMs = Date.now(),
  ledgerCount = 0,
  minimumAgeMs = LIUHAOYI_ALIPAY_RECOVERY_MINIMUM_AGE_MS,
} = {}) {
  if (
    session?.provider !== "liuhaoyi"
    || !["recharge", "account_recharge"].includes(session?.businessType)
    || session?.channelCode !== "alipay"
    || session?.currency !== "CNY"
  ) {
    return denied("scope_not_allowed", false, null);
  }
  if (!ACTIVE_SESSION_STATUSES.has(session.localStatus)) {
    return denied(
      "session_not_active",
      session.localStatus !== "paid",
      "provider_paid_local_unpaid",
    );
  }
  if (!isOldEnough(session.createdAt, nowMs, minimumAgeMs)) {
    return denied("callback_grace_period", false, null);
  }
  if (!recharge) {
    return denied("recharge_missing", true, "provider_paid_local_unpaid");
  }
  if (
    String(session.businessId) !== String(recharge.id)
    || String(session.businessNo) !== String(recharge.rechargeNo)
    || String(session.userId) !== String(recharge.userId)
  ) {
    return denied("ownership_mismatch", true, "transaction_id_conflict");
  }
  if (!ACTIVE_RECHARGE_STATUSES.has(recharge.status)) {
    return denied("recharge_not_active", true, "provider_paid_local_unpaid");
  }
  if (Number(recharge.creditedAmount ?? 0) !== 0 || recharge.completedAt) {
    return denied("recharge_already_credited", true, "provider_paid_local_unpaid");
  }
  if (!Number.isInteger(ledgerCount) || ledgerCount !== 0) {
    return denied("completed_ledger_exists", true, "provider_paid_local_unpaid");
  }
  if (provider?.found !== true) {
    return denied("provider_not_found", true, "provider_not_found");
  }
  if (provider.status !== "paid") {
    return denied("provider_not_paid", false, null);
  }
  if (session.currency !== "CNY" || provider.currency !== "CNY") {
    return denied("currency_mismatch", true, "currency_mismatch");
  }
  if (!amountEqual(session.localAmount, provider.amount)) {
    return denied("amount_mismatch", true, "amount_mismatch");
  }
  if (provider.type !== "alipay") {
    return denied("provider_type_mismatch", true, "status_mismatch");
  }
  if (!validTradeNo(provider.tradeNo)) {
    return denied("provider_trade_no_missing", true, "transaction_id_conflict");
  }
  if (!validTradeNo(session.providerOrderNo)) {
    return denied("provider_order_no_missing", true, "transaction_id_conflict");
  }
  if (session.providerOrderNo !== provider.tradeNo) {
    return denied("provider_order_no_mismatch", true, "transaction_id_conflict");
  }
  if (session.localTradeNo && session.localTradeNo !== provider.tradeNo) {
    return denied("provider_transaction_id_conflict", true, "transaction_id_conflict");
  }
  if (!validTradeNo(provider.outTradeNo)) {
    return denied("out_trade_no_missing", true, "transaction_id_conflict");
  }
  if (provider.outTradeNo !== session.sessionNo) {
    return denied("out_trade_no_mismatch", true, "transaction_id_conflict");
  }
  const paidAtMs = liuhaoyiPaidTimeMs(provider.endtime ?? provider.paidAt);
  const sessionCreatedMs = Date.parse(String(session.createdAt ?? ""));
  const rechargeCreatedMs = Date.parse(String(recharge.createdAt ?? ""));
  const sessionExpiryMs = Date.parse(String(session.expiresAt ?? ""));
  const rechargeExpiryMs = Date.parse(String(recharge.expiresAt ?? ""));
  if (!Number.isFinite(paidAtMs)) {
    return denied("provider_paid_time_missing", true, "provider_paid_local_unpaid");
  }
  if (
    !Number.isFinite(sessionCreatedMs)
    || !Number.isFinite(rechargeCreatedMs)
    || paidAtMs < sessionCreatedMs
    || paidAtMs < rechargeCreatedMs
    || paidAtMs > nowMs + 5 * 60_000
  ) {
    return denied("provider_paid_time_invalid", true, "provider_paid_local_unpaid");
  }
  if (
    !Number.isFinite(sessionExpiryMs)
    || !Number.isFinite(rechargeExpiryMs)
    || paidAtMs > sessionExpiryMs
    || paidAtMs > rechargeExpiryMs
  ) {
    return denied("provider_paid_after_expiry", true, "provider_paid_local_unpaid");
  }
  return {
    eligible: true,
    reason: "eligible",
    manualReview: false,
    differenceType: "provider_paid_local_unpaid",
  };
}

export function evaluateLiuhaoyiWechatRechargeRecovery({
  session,
  recharge,
  provider,
  ledgerCount = 0,
  nowMs = Date.now(),
  minimumAgeMs = LIUHAOYI_RECOVERY_MINIMUM_AGE_MS,
} = {}) {
  if (
    session?.provider !== "liuhaoyi"
    || !["recharge", "account_recharge"].includes(session?.businessType)
    || session?.channelCode !== "wechat"
    || session?.currency !== "CNY"
  ) {
    return denied("scope_not_allowed", false, null);
  }
  if (!ACTIVE_SESSION_STATUSES.has(session.localStatus)) {
    return denied("session_not_active", session.localStatus !== "paid", "provider_paid_local_unpaid");
  }
  if (!isOldEnough(session.createdAt, nowMs, minimumAgeMs)) {
    return denied("callback_grace_period", false, null);
  }
  if (!recharge) return denied("recharge_missing", true, "provider_paid_local_unpaid");
  if (
    String(session.businessId) !== String(recharge.id)
    || String(session.businessNo) !== String(recharge.rechargeNo)
    || String(session.userId) !== String(recharge.userId)
  ) {
    return denied("ownership_mismatch", true, "transaction_id_conflict");
  }
  if (!ACTIVE_RECHARGE_STATUSES.has(recharge.status)) {
    return denied("recharge_not_active", true, "provider_paid_local_unpaid");
  }
  if (Number(recharge.creditedAmount ?? 0) !== 0 || recharge.completedAt) {
    return denied("recharge_already_credited", true, "provider_paid_local_unpaid");
  }
  if (!Number.isInteger(ledgerCount) || ledgerCount !== 0) {
    return denied("completed_ledger_exists", true, "provider_paid_local_unpaid");
  }
  if (provider?.found !== true) return denied("provider_not_found", true, "provider_not_found");
  if (provider.status !== "paid") return denied("provider_not_paid", false, null);
  if (provider.currency !== "CNY") return denied("currency_mismatch", true, "currency_mismatch");
  if (!amountEqual(session.localAmount, provider.amount)) {
    return denied("amount_mismatch", true, "amount_mismatch");
  }
  if (provider.type !== "wxpay") return denied("provider_type_mismatch", true, "status_mismatch");
  if (!validTradeNo(provider.tradeNo)) {
    return denied("provider_trade_no_missing", true, "transaction_id_conflict");
  }
  if (!validTradeNo(session.providerOrderNo)) {
    return denied("provider_order_no_missing", true, "transaction_id_conflict");
  }
  if (session.providerOrderNo !== provider.tradeNo) {
    return denied("provider_order_no_mismatch", true, "transaction_id_conflict");
  }
  if (session.localTradeNo && session.localTradeNo !== provider.tradeNo) {
    return denied("provider_transaction_id_conflict", true, "transaction_id_conflict");
  }
  if (!validTradeNo(provider.outTradeNo) || provider.outTradeNo !== session.sessionNo) {
    return denied(
      validTradeNo(provider.outTradeNo) ? "out_trade_no_mismatch" : "out_trade_no_missing",
      true,
      "transaction_id_conflict",
    );
  }
  const paidAtMs = liuhaoyiPaidTimeMs(provider.endtime ?? provider.paidAt);
  const sessionCreatedMs = Date.parse(String(session.createdAt ?? ""));
  const rechargeCreatedMs = Date.parse(String(recharge.createdAt ?? ""));
  const sessionExpiryMs = Date.parse(String(session.expiresAt ?? ""));
  const rechargeExpiryMs = Date.parse(String(recharge.expiresAt ?? ""));
  if (!Number.isFinite(paidAtMs)) {
    return denied("provider_paid_time_missing", true, "provider_paid_local_unpaid");
  }
  if (
    !Number.isFinite(sessionCreatedMs)
    || !Number.isFinite(rechargeCreatedMs)
    || paidAtMs < sessionCreatedMs
    || paidAtMs < rechargeCreatedMs
    || paidAtMs > nowMs + 5 * 60_000
  ) {
    return denied("provider_paid_time_invalid", true, "provider_paid_local_unpaid");
  }
  if (
    !Number.isFinite(sessionExpiryMs)
    || !Number.isFinite(rechargeExpiryMs)
    || paidAtMs > sessionExpiryMs
    || paidAtMs > rechargeExpiryMs
  ) {
    return denied("provider_paid_after_expiry", true, "provider_paid_local_unpaid");
  }
  return {
    eligible: true,
    reason: "eligible",
    manualReview: false,
    differenceType: "provider_paid_local_unpaid",
  };
}

function denied(reason, manualReview, differenceType) {
  return { eligible: false, reason, manualReview, differenceType };
}

function validTradeNo(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 160;
}

function isFutureWithMargin(value, nowMs, marginMs) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) && timestamp - nowMs > marginMs;
}

function isOldEnough(value, nowMs, minimumAgeMs) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) && nowMs - timestamp >= minimumAgeMs;
}

function amountEqual(left, right) {
  const leftCents = cnyCents(left);
  const rightCents = cnyCents(right);
  return leftCents !== null && rightCents !== null && leftCents === rightCents;
}

function cnyCents(value) {
  if (typeof value === "number") {
    const scaled = value * 100;
    if (
      !Number.isFinite(value)
      || value <= 0
      || Math.abs(Math.round(scaled) - scaled) > Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4
    ) {
      return null;
    }
    return Math.round(scaled);
  }
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) {
    return null;
  }
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}
