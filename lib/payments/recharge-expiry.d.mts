export const LIUHAOYI_RECHARGE_TTL_MINUTES: 30;

export function createLiuhaoyiRechargeWindow(now?: Date): {
  createdAt: string;
  expiresAt: string;
};

export function isLiuhaoyiRechargeChannel(channel: unknown): boolean;
export function isRechargePastDue(expiresAt: unknown, now?: Date): boolean;
export function shouldExpireLiuhaoyiRecharge(record: Record<string, unknown> | null | undefined, now?: Date): boolean;
export function canContinueLiuhaoyiRechargePayment(record: Record<string, unknown> | null | undefined, now?: Date): boolean;
