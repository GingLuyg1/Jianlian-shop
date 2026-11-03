// Account funding only. Store order payment sessions keep their existing TTL.
export const ACCOUNT_RECHARGE_EXPIRY_MINUTES = 10;
export const ACCOUNT_RECHARGE_EXPIRY_MS = ACCOUNT_RECHARGE_EXPIRY_MINUTES * 60 * 1000;

export function createAccountRechargeExpiryWindow(now = new Date()) {
  const createdAtMs = new Date(now).getTime();
  if (!Number.isFinite(createdAtMs)) throw new TypeError("Invalid recharge creation time");
  return {
    createdAt: new Date(createdAtMs).toISOString(),
    expiresAt: new Date(createdAtMs + ACCOUNT_RECHARGE_EXPIRY_MS).toISOString(),
  };
}
