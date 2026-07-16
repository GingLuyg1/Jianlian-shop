import type {
  PaymentChannel,
  PaymentChannelCode,
  PaymentCurrency,
  PaymentNetwork,
  PaymentProviderCode,
  RechargeStatus,
} from "@/lib/payments/channel-types";
import { normalizeRechargeStatus, rechargeFlowStatusLabel } from "@/lib/recharges/status-machine";

export const RECHARGE_STATUSES: RechargeStatus[] = [
  "pending",
  "waiting_payment",
  "submitted",
  "reviewing",
  "approved",
  "processing",
  "succeeded",
  "paid",
  "failed",
  "rejected",
  "cancelled",
  "expired",
  "closed",
];

export type PublicPaymentChannel = Omit<PaymentChannel, "configured">;

export type RechargeRecord = {
  rechargeNo: string;
  channelCode: string;
  channelName: string;
  currency: PaymentCurrency;
  network: string | null;
  requestedAmount: number;
  feeAmount: number;
  payableAmount: number;
  creditedAmount: number;
  status: RechargeStatus;
  createdAt: string;
  paidAt: string | null;
  completedAt?: string | null;
  reviewReason?: string | null;
};

type AnyRow = Record<string, unknown>;

export function getPaymentErrorMessage(
  error: unknown,
  fallback = "操作失败，请稍后重试"
) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export function isPaymentSchemaUnavailable(error: unknown) {
  return /account_recharges|payment_channels|schema cache|PGRST205|42P01|42703/i.test(
    getPaymentErrorMessage(error, "")
  );
}

export function normalizeChannelRow(row: AnyRow): PaymentChannel | null {
  const code = String(row.code ?? row.channel ?? "") as PaymentChannelCode;
  if (!isKnownChannel(code)) return null;

  const currency: PaymentCurrency = row.currency === "USDT" ? "USDT" : "CNY";
  const provider = normalizeProvider(row.provider ?? row.provider_name, code);
  const network = normalizeNetwork(row.network, code);
  const minimumAmount = finiteNumber(row.minimum_amount ?? row.min_amount);
  const feeRate = finiteNumber(row.fee_rate);
  const enabled = row.enabled === true;
  const publicConfig = row.public_config && typeof row.public_config === "object" ? row.public_config as Record<string, unknown> : {};
  const configured = row.configured === true;
  const reviewMode = publicConfig.review_mode === "manual" || publicConfig.payment_mode === "manual" ? "manual" : "provider";

  return {
    channel_code: code,
    code,
    display_name: String(row.display_name ?? channelLabel(code)),
    name: String(row.display_name ?? channelLabel(code)),
    currency,
    network,
    networkLabel:
      code === "usdt_trc20" ? "TRON" : code === "usdt_bep20" ? "BSC" : undefined,
    minimum_amount: minimumAmount,
    minimumAmount,
    fee_rate: feeRate,
    feeRate,
    status: enabled && configured ? "active" : "disabled",
    enabled,
    configured,
    reviewMode,
    maximumAmount: finiteNumber(publicConfig.maximum_amount, currency === "USDT" ? 100000 : 1000000),
    provider,
    sort_order: Math.trunc(finiteNumber(row.sort_order, 100)),
    iconSrc: channelIcon(code),
  };
}

export function normalizeRechargeRow(row: AnyRow): RechargeRecord {
  const status = normalizeRechargeStatus(row.status) as RechargeStatus;
  const currency: PaymentCurrency = row.currency === "USDT" ? "USDT" : "CNY";
  return {
    rechargeNo: String(row.recharge_no ?? ""),
    channelCode: String(row.channel_code ?? row.channel ?? ""),
    channelName: String(row.channel_name ?? channelLabel(String(row.channel_code ?? row.channel ?? ""))),
    currency,
    network: textOrNull(row.network),
    requestedAmount: finiteNumber(row.requested_amount ?? row.amount),
    feeAmount: finiteNumber(row.fee_amount),
    payableAmount: finiteNumber(row.payable_amount),
    creditedAmount: finiteNumber(row.credited_amount ?? row.received_amount),
    status,
    createdAt: String(row.created_at ?? ""),
    paidAt: textOrNull(row.paid_at),
    completedAt: textOrNull(row.completed_at ?? row.paid_at),
    reviewReason: textOrNull(row.review_reason ?? row.error_summary),
  };
}

export function channelLabel(code: string) {
  return (
    {
      alipay: "支付宝",
      wechat: "微信支付",
      binance: "币安转账",
      binance_pay: "币安转账",
      usdt_trc20: "USDT-TRC20",
      usdt_bep20: "USDT-BEP20",
    }[code] ?? code ?? "—"
  );
}

export function rechargeStatusLabel(status: string) {
  return rechargeFlowStatusLabel(status);
  /* Legacy labels retained below for source compatibility. */
  return (
    {
      pending: "待支付",
      processing: "处理中",
      paid: "已到账",
      failed: "失败",
      expired: "已过期",
      closed: "已关闭",
    }[status] ?? "待支付"
  );
}

function isKnownChannel(value: string): value is PaymentChannelCode {
  return ["alipay", "wechat", "binance_pay", "usdt_trc20", "usdt_bep20"].includes(value);
}

function normalizeProvider(value: unknown, code: PaymentChannelCode): PaymentProviderCode {
  if (value === "generic_api" || value === "binance" || value === "crypto_address") return value;
  if (code === "alipay" || code === "wechat") return "generic_api";
  if (code === "binance_pay") return "binance";
  return "crypto_address";
}

function normalizeNetwork(value: unknown, code: PaymentChannelCode): PaymentNetwork | undefined {
  const text = String(value ?? "").toUpperCase();
  if (code === "usdt_trc20" || text === "TRON" || text === "TRC20") return "TRC20";
  if (code === "usdt_bep20" || text === "BSC" || text === "BEP20") return "BEP20";
  return undefined;
}

function channelIcon(code: PaymentChannelCode) {
  return {
    alipay: "/assets/alipay-icon.jpg",
    wechat: "/assets/wechat-pay-icon.jpg",
    binance_pay: "/assets/binance-pay-icon.jpg",
    usdt_trc20: "/assets/usdt-trc20-icon.jpg",
    usdt_bep20: "/assets/usdt-bep20-icon.jpg",
  }[code];
}

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
