import { compareRechargeDecimals, parseRequestedCnyAmount } from "./recharge-rate.mjs";

export const ONLINE_CNY_MAXIMUM = 2000;
export const ONLINE_PAYMENT_LIMIT_MESSAGE = "支付金额大于2000联系人工客服处理。";

// Limit: server-authoritative CNY principal/API money, not cashier gross.
// The external cashier fee must NEVER enter API payable or credit.
export function isOnlineCnyOverLimit(value) {
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  return compareRechargeDecimals(text, String(ONLINE_CNY_MAXIMUM)) === 1;
}

export function isStrictPositiveCny(value) {
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  return parseRequestedCnyAmount(text) !== null;
}

export function onlineOrderPrincipal(price, quantity) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || !isStrictPositiveCny(price)) return null;
  const [whole, fraction = ""] = String(price).split(".");
  const cents = (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))) * BigInt(quantity);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

// Display-only estimate. Actual cashier charges can differ. Upstream
// settlement cost is unknown and must not be confused with this buyer fee.
export function estimateExternalBuyerFee(principal) {
  const text = typeof principal === "number" && Number.isFinite(principal) ? String(principal) : principal;
  const normalized = parseRequestedCnyAmount(text);
  if (!normalized) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  const fee = (cents * 3n + 50n) / 100n;
  const format = (value) => `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
  return { principal: format(cents), buyerFeeEstimate: format(fee),
    cashierTotalEstimate: format(cents + fee), apiPayable: format(cents),
    creditPrincipal: format(cents), siteFee: "0.00" };
}
