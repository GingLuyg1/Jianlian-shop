export const ORDER_STATUS_VALUES = [
  "pending_payment",
  "paid",
  "processing",
  "delivered",
  "completed",
  "cancelled",
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
  pending_payment: ["paid", "cancelled"],
  paid: ["processing", "refunded"],
  processing: ["delivered", "failed", "refunded"],
  delivered: ["completed", "refunded"],
  completed: [],
  cancelled: [],
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

export function canTransitionOrder(from: unknown, to: unknown) {
  const fromStatus = normalizeOrderStatus(from);
  const toStatus = normalizeOrderStatus(to);
  return ORDER_STATUS_TRANSITIONS[fromStatus].includes(toStatus);
}
