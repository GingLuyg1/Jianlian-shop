export const LIUHAOYI_RECHARGE_TTL_MINUTES = 30;

const LIUHAOYI_CHANNELS = new Set(["alipay", "wechat", "wechat_pay"]);
const ACTIVE_RECHARGE_STATUSES = new Set(["pending", "waiting_payment", "processing"]);

export function createLiuhaoyiRechargeWindow(now = new Date()) {
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(new Date(now).getTime() + LIUHAOYI_RECHARGE_TTL_MINUTES * 60 * 1000).toISOString();
  return { createdAt, expiresAt };
}

export function isLiuhaoyiRechargeChannel(channel) {
  return LIUHAOYI_CHANNELS.has(String(channel ?? "").trim());
}

export function isRechargePastDue(expiresAt, now = new Date()) {
  const expiry = Date.parse(String(expiresAt ?? ""));
  return Number.isFinite(expiry) && expiry <= new Date(now).getTime();
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
