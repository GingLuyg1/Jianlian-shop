export const LIUHAOYI_MIN_PAYMENT_CENTS: bigint;
export const LIUHAOYI_MAX_PAYMENT_CENTS: bigint;
export function isLiuhaoyiPaymentMethod(value: unknown): boolean;
export function cnyToMinorUnits(value: unknown): bigint | null;
export function isLiuhaoyiAmountOverLimit(value: unknown): boolean;
export function assertLiuhaoyiPaymentAmount(value: unknown): string;
