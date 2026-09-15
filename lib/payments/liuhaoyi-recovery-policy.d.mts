export const LIUHAOYI_ALIPAY_RECHARGE_RECOVERY_MODE: "alipay_account_recharge_v1";
export const LIUHAOYI_RECOVERY_MINIMUM_AGE_MS: number;
export const LIUHAOYI_RECOVERY_EXPIRY_MARGIN_MS: number;

export type LiuhaoyiRecoveryDecision = {
  eligible: boolean;
  reason: string;
  manualReview: boolean;
  differenceType:
    | "provider_paid_local_unpaid"
    | "provider_not_found"
    | "currency_mismatch"
    | "amount_mismatch"
    | "status_mismatch"
    | "transaction_id_conflict"
    | null;
};

export function evaluateLiuhaoyiAlipayRechargeRecovery(input: {
  session?: {
    provider?: unknown;
    businessType?: unknown;
    channelCode?: unknown;
    localStatus?: unknown;
    expiresAt?: unknown;
    createdAt?: unknown;
    currency?: unknown;
    localAmount?: unknown;
    sessionNo?: unknown;
    providerOrderNo?: unknown;
    localTradeNo?: unknown;
  } | null;
  recharge?: { status?: unknown; expiresAt?: unknown } | null;
  provider?: {
    found?: unknown;
    status?: unknown;
    currency?: unknown;
    amount?: unknown;
    type?: unknown;
    tradeNo?: unknown;
    outTradeNo?: unknown;
  } | null;
  nowMs?: number;
  minimumAgeMs?: number;
  expiryMarginMs?: number;
}): LiuhaoyiRecoveryDecision;
