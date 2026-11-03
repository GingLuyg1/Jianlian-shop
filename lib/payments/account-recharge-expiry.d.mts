export const ACCOUNT_RECHARGE_EXPIRY_MINUTES: 10;
export const ACCOUNT_RECHARGE_EXPIRY_MS: 600000;
export function createAccountRechargeExpiryWindow(now?: Date): {
  createdAt: string;
  expiresAt: string;
};
