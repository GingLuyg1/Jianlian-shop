export const PAYMENT_REVIEW_STATUS_VALUES = [
  "pending",
  "submitted",
  "under_review",
  "paid",
  "rejected",
  "cancelled",
] as const;

export type PaymentReviewStatus = (typeof PAYMENT_REVIEW_STATUS_VALUES)[number];

export const PAYMENT_REVIEW_STATUS_LABELS: Record<PaymentReviewStatus, string> = {
  pending: "待提交",
  submitted: "待审核",
  under_review: "审核中",
  paid: "已到账",
  rejected: "已驳回",
  cancelled: "已取消",
};

export const PAYMENT_REVIEW_STATUS_STYLES: Record<PaymentReviewStatus, string> = {
  pending: "border-slate-200 bg-slate-50 text-slate-600",
  submitted: "border-amber-200 bg-amber-50 text-amber-700",
  under_review: "border-blue-200 bg-blue-50 text-blue-700",
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
  cancelled: "border-slate-200 bg-slate-100 text-slate-500",
};

export function normalizePaymentReviewStatus(value: unknown): PaymentReviewStatus {
  return PAYMENT_REVIEW_STATUS_VALUES.includes(value as PaymentReviewStatus)
    ? (value as PaymentReviewStatus)
    : "pending";
}

export function getPaymentReviewStatusLabel(value: unknown) {
  return PAYMENT_REVIEW_STATUS_LABELS[normalizePaymentReviewStatus(value)];
}

export type ManualPaymentMethod = {
  id: string;
  label: string;
  enabled: boolean;
  accountLabel?: string;
  account?: string;
  description: string;
  instructions: string[];
};

export const MANUAL_PAYMENT_METHODS: ManualPaymentMethod[] = [
  {
    id: "manual_contact",
    label: "人工联系支付",
    enabled: true,
    description: "提交订单后联系在线客服获取收款信息，付款后上传凭证等待人工确认。",
    instructions: [
      "请先确认订单编号和应付金额。",
      "联系客服获取当前可用收款方式。",
      "付款后上传截图或填写交易参考号，管理员确认到账后处理订单。",
    ],
  },
  {
    id: "bank_transfer",
    label: "银行转账",
    enabled: false,
    description: "当前银行转账信息尚未配置。",
    instructions: ["当前支付方式暂不可用。"],
  },
  {
    id: "alipay_transfer",
    label: "支付宝转账",
    enabled: false,
    description: "当前支付宝收款信息尚未配置。",
    instructions: ["当前支付方式暂不可用。"],
  },
  {
    id: "wechat_transfer",
    label: "微信转账",
    enabled: false,
    description: "当前微信收款信息尚未配置。",
    instructions: ["当前支付方式暂不可用。"],
  },
  {
    id: "usdt_transfer",
    label: "USDT 转账",
    enabled: false,
    description: "当前 USDT 钱包信息尚未配置。",
    instructions: ["当前支付方式暂不可用。"],
  },
];

export function getManualPaymentMethod(methodId: string | null | undefined) {
  return MANUAL_PAYMENT_METHODS.find((method) => method.id === methodId) ?? null;
}

export function getEnabledManualPaymentMethods() {
  return MANUAL_PAYMENT_METHODS.filter((method) => method.enabled);
}

export function getPaymentErrorMessage(error: unknown, fallback = "操作失败，请稍后重试") {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage) return maybeMessage;
  }
  return fallback;
}
