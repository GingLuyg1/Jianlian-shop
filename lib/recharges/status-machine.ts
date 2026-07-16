export const RECHARGE_STATUS_VALUES = [
  "pending", "waiting_payment", "submitted", "reviewing", "approved", "processing",
  "succeeded", "failed", "rejected", "cancelled", "expired",
] as const;

export type RechargeFlowStatus = (typeof RECHARGE_STATUS_VALUES)[number];

const LEGACY_STATUS_MAP: Record<string, RechargeFlowStatus> = { paid: "succeeded", closed: "cancelled" };
const TRANSITIONS: Record<RechargeFlowStatus, readonly RechargeFlowStatus[]> = {
  pending: ["waiting_payment", "submitted", "cancelled", "expired", "failed"],
  waiting_payment: ["submitted", "processing", "cancelled", "expired", "failed"],
  submitted: ["reviewing", "cancelled", "expired"],
  reviewing: ["approved", "rejected", "submitted", "cancelled"],
  approved: ["processing", "failed"],
  processing: ["succeeded", "failed"],
  succeeded: [],
  failed: ["processing", "cancelled"],
  rejected: ["submitted", "cancelled"],
  cancelled: [],
  expired: [],
};

export function normalizeRechargeStatus(value: unknown): RechargeFlowStatus {
  const status = String(value ?? "pending").trim().toLowerCase();
  if (status in LEGACY_STATUS_MAP) return LEGACY_STATUS_MAP[status];
  return RECHARGE_STATUS_VALUES.includes(status as RechargeFlowStatus) ? (status as RechargeFlowStatus) : "pending";
}

export function canTransitionRecharge(from: unknown, to: RechargeFlowStatus) {
  return TRANSITIONS[normalizeRechargeStatus(from)].includes(to);
}

export function isRechargeTerminal(status: unknown) {
  return ["succeeded", "cancelled", "expired"].includes(normalizeRechargeStatus(status));
}

export function rechargeFlowStatusLabel(status: unknown) {
  return {
    pending: "待处理", waiting_payment: "等待付款", submitted: "已提交凭证", reviewing: "审核中",
    approved: "审核通过，待入账", processing: "入账处理中", succeeded: "充值成功", failed: "处理失败",
    rejected: "已驳回", cancelled: "已撤销", expired: "已过期",
  }[normalizeRechargeStatus(status)];
}
