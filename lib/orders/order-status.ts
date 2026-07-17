export const ORDER_STATUS_VALUES = [
  "pending_payment",
  "paid",
  "processing",
  "delivered",
  "completed",
  "cancelled",
  "expired",
  "refunded",
  "failed",
] as const;

export const PAYMENT_STATUS_VALUES = [
  "unpaid",
  "paid",
  "refunded",
  "partially_refunded",
  "failed",
] as const;

export type OrderStatus = (typeof ORDER_STATUS_VALUES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUS_VALUES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "待支付",
  paid: "已支付",
  processing: "处理中",
  delivered: "已发货",
  completed: "已完成",
  cancelled: "已取消",
  expired: "已过期",
  refunded: "已退款",
  failed: "处理失败",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "未支付",
  paid: "已支付",
  refunded: "已退款",
  partially_refunded: "部分退款",
  failed: "支付失败",
};

export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  pending_payment: "border-amber-200 bg-amber-50 text-amber-700",
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  processing: "border-blue-200 bg-blue-50 text-blue-700",
  delivered: "border-sky-200 bg-sky-50 text-sky-700",
  completed: "border-green-200 bg-green-50 text-green-700",
  cancelled: "border-slate-200 bg-slate-50 text-slate-600",
  expired: "border-slate-200 bg-slate-50 text-slate-600",
  refunded: "border-violet-200 bg-violet-50 text-violet-700",
  failed: "border-red-200 bg-red-50 text-red-700",
};

export const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
  unpaid: "border-amber-200 bg-amber-50 text-amber-700",
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  refunded: "border-violet-200 bg-violet-50 text-violet-700",
  partially_refunded: "border-violet-200 bg-violet-50 text-violet-700",
  failed: "border-red-200 bg-red-50 text-red-700",
};

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["paid", "cancelled", "expired"],
  paid: ["processing", "refunded"],
  processing: ["delivered", "failed", "refunded"],
  delivered: ["completed", "refunded"],
  completed: [],
  cancelled: [],
  expired: [],
  refunded: [],
  failed: ["processing", "refunded"],
};

export function normalizeOrderStatus(value: unknown): OrderStatus {
  return ORDER_STATUS_VALUES.includes(value as OrderStatus)
    ? (value as OrderStatus)
    : "pending_payment";
}

export function normalizePaymentStatus(value: unknown): PaymentStatus {
  return PAYMENT_STATUS_VALUES.includes(value as PaymentStatus)
    ? (value as PaymentStatus)
    : "unpaid";
}

export function getOrderStatusLabel(value: unknown) {
  return ORDER_STATUS_LABELS[normalizeOrderStatus(value)];
}

export function getPaymentStatusLabel(value: unknown) {
  return PAYMENT_STATUS_LABELS[normalizePaymentStatus(value)];
}

export function canUserCancelOrder(status: unknown) {
  return normalizeOrderStatus(status) === "pending_payment";
}

export function canContinueBep20Payment(order: {
  status?: unknown;
  payment_status?: unknown;
  payment_method?: unknown;
  bep20_payment_state?: unknown;
}) {
  if (String(order.bep20_payment_state ?? "") === "continue_active_payment") return true;
  if (order.bep20_payment_state) return false;

  const status = String(order.status ?? "").trim();
  const paymentStatus = String(order.payment_status ?? "").trim();
  const paymentMethod = String(order.payment_method ?? "").trim().toLowerCase();

  return (
    (status === "pending_payment" || status === "待支付") &&
    (paymentStatus === "unpaid" || paymentStatus === "未支付") &&
    paymentMethod === "usdt_bep20"
  );
}

export function getBep20PaymentAction(order: {
  status?: unknown;
  payment_status?: unknown;
  payment_method?: unknown;
  bep20_payment_state?: unknown;
}) {
  const state = String(order.bep20_payment_state ?? "").trim();
  if (state === "continue_active_payment") {
    return { kind: "continue" as const, label: "继续支付" };
  }
  if (state === "renew_payment_session") {
    return { kind: "renew" as const, label: "重新生成支付单" };
  }
  if (state === "submit_late_transaction") {
    return { kind: "late" as const, label: "提交旧交易哈希" };
  }
  if (state === "view_status") {
    return { kind: "status" as const, label: "查看支付状态" };
  }
  return null;
}

export function getBep20PaymentNotice(order: { bep20_payment_state?: unknown }) {
  const state = String(order.bep20_payment_state ?? "").trim();
  if (state === "rejected") return "该支付已结束，如有疑问请联系客服。";
  return null;
}

export function canTransitionOrder(from: unknown, to: unknown) {
  const fromStatus = normalizeOrderStatus(from);
  const toStatus = normalizeOrderStatus(to);
  return ORDER_STATUS_TRANSITIONS[fromStatus].includes(toStatus);
}
