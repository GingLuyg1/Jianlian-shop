export const REFUND_ACTIVE_STATUSES = ["requested", "reviewing", "approved", "processing"] as const;
export const REFUND_FINAL_STATUSES = ["succeeded", "rejected", "failed", "cancelled"] as const;

import { formatCurrency } from "@/lib/i18n/money";

export type RefundStatus =
  | "requested"
  | "reviewing"
  | "approved"
  | "processing"
  | "succeeded"
  | "rejected"
  | "failed"
  | "cancelled";

export type RefundMethod = "balance" | "external" | "manual";

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  requested: "待审核",
  reviewing: "审核中",
  approved: "已批准",
  processing: "处理中",
  succeeded: "已完成",
  rejected: "已拒绝",
  failed: "失败",
  cancelled: "已取消",
};

export const REFUND_METHOD_LABELS: Record<RefundMethod, string> = {
  balance: "余额退款",
  external: "外部渠道",
  manual: "人工登记",
};

export const REFUND_ACTION_LABELS: Record<string, string> = {
  approve_balance: "批准余额退款",
  reject: "拒绝退款",
  cancel: "取消退款",
  mark_processing: "标记处理中",
  complete_external: "登记外部退款完成",
  fail: "标记失败",
};

export function isRefundSchemaMissing(message: string) {
  return /refund_requests|refund_status_logs|site_notifications|schema cache|PGRST205|42P01|42703/i.test(message);
}

export function toMoney(value: unknown) {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function formatMoney(value: unknown, currency = "CNY") {
  return formatCurrency(value, currency);
}

export function maskEmail(email: unknown) {
  const raw = String(email ?? "");
  const [name, domain] = raw.split("@");
  if (!name || !domain) return raw || "-";
  if (name.length <= 3) return `${name[0] ?? "*"}***@${domain}`;
  return `${name.slice(0, 3)}***@${domain}`;
}

export function normalizeRefundError(message: string) {
  if (isRefundSchemaMissing(message)) {
    return "退款售后功能尚未完成数据库初始化，请管理员执行退款系统 migration。";
  }
  if (/permission|rls|not authorized|无权|权限/i.test(message)) return "当前账号无权执行该退款操作。";
  if (/duplicate|unique/i.test(message)) return "该订单已有处理中的退款申请，请勿重复提交。";
  return message || "退款操作失败，请稍后重试。";
}
