export const PAYMENT_SESSION_EXPIRY_MINUTES: 15;
export const PAYMENT_SESSION_EXPIRY_MS: 900000;

export function createPaymentExpiryWindow(now?: Date): {
  createdAt: string;
  expiresAt: string;
};

export function isPaymentExpired(expiresAt: unknown, now?: Date): boolean;
