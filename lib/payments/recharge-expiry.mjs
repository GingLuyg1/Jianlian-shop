import {
  PAYMENT_SESSION_EXPIRY_MINUTES,
  createPaymentExpiryWindow,
  isPaymentExpired,
} from "./payment-expiry.mjs";
export const LIUHAOYI_RECHARGE_TTL_MINUTES = PAYMENT_SESSION_EXPIRY_MINUTES;

const LIUHAOYI_CHANNELS = new Set(["alipay", "wechat", "wechat_pay"]);
const ACTIVE_RECHARGE_STATUSES = new Set(["pending", "waiting_payment", "processing"]);

export function createLiuhaoyiRechargeWindow(now = new Date()) {
  return createPaymentExpiryWindow(now);
}

export function isLiuhaoyiRechargeChannel(channel) {
  return LIUHAOYI_CHANNELS.has(String(channel ?? "").trim());
}

export function isRechargePastDue(expiresAt, now = new Date()) {
  return isPaymentExpired(expiresAt, now);
}

export function shouldExpireLiuhaoyiRecharge(record, now = new Date()) {
  return isLiuhaoyiRechargeChannel(record?.channelCode ?? record?.channel_code ?? record?.channel)
    && ACTIVE_RECHARGE_STATUSES.has(String(record?.status ?? ""))
    && isRechargePastDue(record?.expiresAt ?? record?.expires_at, now);
}

export function canContinueLiuhaoyiRechargePayment(record, now = new Date()) {
  return isLiuhaoyiRechargeChannel(record?.channelCode ?? record?.channel_code ?? record?.channel)
    && ["pending", "waiting_payment"].includes(String(record?.status ?? ""))
    && !isRechargePastDue(record?.expiresAt ?? record?.expires_at, now);
}
