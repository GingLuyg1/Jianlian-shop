export function deriveRechargeSettlementRate(marketRate: unknown): string | null;
export function calculateExpectedUsdtAmount(requestedCnyAmount: unknown, settlementRate: unknown): string | null;
export function calculateCreditedCnyAmount(actualReceivedUsdt: unknown, settlementRate: unknown): string | null;
export function parseRequestedCnyAmount(value: unknown): string | null;
export function compareRechargeDecimals(leftValue: unknown, rightValue: unknown): -1 | 0 | 1 | null;
export function isCanonicalRechargeRate(value: unknown): boolean;
