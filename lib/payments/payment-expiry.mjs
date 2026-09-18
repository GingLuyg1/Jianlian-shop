export const PAYMENT_SESSION_EXPIRY_MINUTES = 15;
export const PAYMENT_SESSION_EXPIRY_MS = PAYMENT_SESSION_EXPIRY_MINUTES * 60 * 1000;

export function createPaymentExpiryWindow(now = new Date()) {
  const createdAtMs = new Date(now).getTime();
  if (!Number.isFinite(createdAtMs)) throw new TypeError("Invalid payment creation time");
  return {
    createdAt: new Date(createdAtMs).toISOString(),
    expiresAt: new Date(createdAtMs + PAYMENT_SESSION_EXPIRY_MS).toISOString(),
  };
}

export function isPaymentExpired(expiresAt, now = new Date()) {
  const expiryMs = Date.parse(String(expiresAt ?? ""));
  const nowMs = new Date(now).getTime();
  return Number.isFinite(expiryMs) && Number.isFinite(nowMs) && expiryMs <= nowMs;
}
