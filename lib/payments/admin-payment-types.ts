export const PAYMENT_BUSINESS_TYPES = ["order", "recharge"] as const;
export type PaymentBusinessType = (typeof PAYMENT_BUSINESS_TYPES)[number];

export const PAYMENT_STATUS_VALUES = [
  "pending",
  "processing",
  "paid",
  "failed",
  "expired",
  "closed",
  "refunded",
] as const;
export type UnifiedPaymentStatus = (typeof PAYMENT_STATUS_VALUES)[number];

export const PAYMENT_CHANNELS = [
  { id: "alipay", label: "支付宝", network: "" },
  { id: "wechat", label: "微信支付", network: "" },
  { id: "binance_pay", label: "币安转账", network: "Binance" },
  { id: "usdt_trc20", label: "USDT-TRC20", network: "TRC20" },
  { id: "usdt_bep20", label: "USDT-BEP20", network: "BEP20" },
] as const;

export const PAYMENT_EXCEPTION_TYPES = [
  "signature_failed",
  "amount_mismatch",
  "channel_paid_local_unposted",
  "local_paid_channel_abnormal",
  "duplicate_trade_no",
  "balance_credit_failed",
  "order_status_update_failed",
] as const;

export const CALLBACK_RESULT_VALUES = [
  "success",
  "signature_failed",
  "amount_mismatch",
  "order_not_found",
  "duplicate",
  "processing_failed",
] as const;

export type AdminPaymentRecord = {
  id: string;
  source: "order_payments" | "account_recharges";
  payment_no: string;
  business_type: PaymentBusinessType;
  business_no: string | null;
  user_email: string | null;
  channel: string | null;
  network: string | null;
  business_amount: number;
  fee_amount: number;
  payable_amount: number;
  received_amount: number;
  platform_net_amount: number;
  status: UnifiedPaymentStatus;
  provider_trade_no: string | null;
  transaction_reference: string | null;
  callback_status: string | null;
  exception_type: string | null;
  error_summary: string | null;
  user_note: string | null;
  admin_note: string | null;
  created_at: string;
  paid_at: string | null;
  updated_at: string;
};

export type AdminPaymentCallback = {
  id: string;
  channel: string | null;
  payment_no: string | null;
  provider_trade_no: string | null;
  signature_result: string | null;
  process_result: string | null;
  http_status: number | null;
  is_duplicate: boolean;
  received_at: string;
  payload_summary: Record<string, unknown> | null;
};

export type PaymentChannelConfig = {
  id: string;
  channel: string;
  enabled: boolean;
  display_name: string;
  min_amount: number;
  fee_rate: number;
  currency: string;
  network: string | null;
  sort_order: number;
  provider_name: string | null;
  api_url: string | null;
  merchant_id_masked: string | null;
  app_id_masked: string | null;
  callback_url: string | null;
  timeout_minutes: number;
  secret_status: string;
  secret_last4: string | null;
  updated_at: string | null;
};

export function normalizeUnifiedPaymentStatus(value: unknown): UnifiedPaymentStatus {
  return PAYMENT_STATUS_VALUES.includes(value as UnifiedPaymentStatus)
    ? (value as UnifiedPaymentStatus)
    : "pending";
}

export function getUnifiedPaymentStatusLabel(value: unknown) {
  const labels: Record<UnifiedPaymentStatus, string> = {
    pending: "待支付",
    processing: "处理中",
    paid: "已支付",
    failed: "失败",
    expired: "已过期",
    closed: "已关闭",
    refunded: "已退款",
  };
  return labels[normalizeUnifiedPaymentStatus(value)];
}

export function getUnifiedPaymentStatusClass(value: unknown) {
  const classes: Record<UnifiedPaymentStatus, string> = {
    pending: "border-amber-200 bg-amber-50 text-amber-700",
    processing: "border-blue-200 bg-blue-50 text-blue-700",
    paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
    failed: "border-red-200 bg-red-50 text-red-700",
    expired: "border-slate-200 bg-slate-100 text-slate-500",
    closed: "border-slate-200 bg-slate-100 text-slate-500",
    refunded: "border-purple-200 bg-purple-50 text-purple-700",
  };
  return classes[normalizeUnifiedPaymentStatus(value)];
}

export function getPaymentChannelLabel(value: string | null | undefined) {
  return PAYMENT_CHANNELS.find((channel) => channel.id === value)?.label ?? (value || "—");
}

export function getBusinessTypeLabel(value: PaymentBusinessType | string | null | undefined) {
  return value === "recharge" ? "账户充值" : "商品订单";
}

export function getExceptionTypeLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    signature_failed: "验签失败",
    amount_mismatch: "金额不一致",
    channel_paid_local_unposted: "渠道已支付但本站未入账",
    local_paid_channel_abnormal: "本站已支付但渠道状态异常",
    duplicate_trade_no: "重复交易号",
    balance_credit_failed: "余额入账失败",
    order_status_update_failed: "订单状态更新失败",
  };
  return value ? labels[value] ?? value : "—";
}

export function maskSensitiveValue(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  if (text.length <= 4) return "****";
  return `****${text.slice(-4)}`;
}

export function maskWallet(value: string | null | undefined) {
  if (!value) return "—";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}
