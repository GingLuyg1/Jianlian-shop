export const ONLINE_CNY_MAXIMUM: 2000;
export const ONLINE_PAYMENT_LIMIT_MESSAGE: string;
export function isOnlineCnyOverLimit(value: unknown): boolean;
export function isStrictPositiveCny(value: unknown): boolean;
export function onlineOrderPrincipal(price: string | number, quantity: number): string | null;
export function estimateExternalBuyerFee(value: unknown): {
  principal: string; buyerFeeEstimate: string; cashierTotalEstimate: string;
  apiPayable: string; creditPrincipal: string; siteFee: string;
} | null;
