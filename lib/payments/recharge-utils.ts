import type {
  PaymentChannel,
  PaymentChannelCode,
  PaymentCurrency,
  PaymentNetwork,
  PaymentProviderCode,
  RechargeStatus,
} from "@/lib/payments/channel-types";
import {
  getCanonicalPaymentChannelCode,
  getPaymentChannelPairValidationError,
  getPaymentChannelValidationError,
  getSafePublicManualPaymentForRow,
  isPublicPaymentChannelReady,
  paymentReviewMode,
} from "@/lib/payments/manual-channel-readiness.mjs";
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

export type RechargeDatabaseDiagnosticCode =
  | "RECHARGE_DB_PERMISSION_DENIED"
  | "RECHARGE_DB_TABLE_MISSING"
  | "RECHARGE_DB_COLUMN_MISSING"
  | "RECHARGE_DB_SCHEMA_CACHE_STALE"
  | "RECHARGE_AUTH_CONTEXT_FAILED"
  | "RECHARGE_DB_QUERY_FAILED";

export type RechargeDatabaseDiagnostic = {
  code: RechargeDatabaseDiagnosticCode;
  message: string;
};

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
  requestedCnyAmount: string | null;
  expectedUsdtAmount: string | null;
  actualReceivedUsdt: string | null;
  creditedCnyAmount: string | null;
  lockedMarketRate: string | null;
  lockedSettlementRate: string | null;
  rateSource: string | null;
  rateEffectiveDate: string | null;
  rateLockedAt: string | null;
  expiresAt: string | null;
  matchedAt: string | null;
  matchMethod: string | null;
  paymentAddress: string | null;
  paymentTokenContract: string | null;
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
  const diagnostic = classifyRechargeDatabaseError(error);
  return [
    "RECHARGE_DB_TABLE_MISSING",
    "RECHARGE_DB_COLUMN_MISSING",
    "RECHARGE_DB_SCHEMA_CACHE_STALE",
  ].includes(diagnostic.code);
}

export function classifyRechargeDatabaseError(error: unknown): RechargeDatabaseDiagnostic {
  const code = getErrorProperty(error, "code").toUpperCase();
  const status = getErrorProperty(error, "status");
  const message = getPaymentErrorMessage(error, "");

  if (code === "42501" || /permission denied/i.test(message)) {
    return {
      code: "RECHARGE_DB_PERMISSION_DENIED",
      message: "充值记录读取权限不足",
    };
  }
  if (code === "42P01" || code === "PGRST205" || /\b(?:42P01|PGRST205)\b/i.test(message)) {
    return {
      code: "RECHARGE_DB_TABLE_MISSING",
      message: "充值数据表不存在或尚未加载",
    };
  }
  if (code === "42703" || /\b42703\b/i.test(message)) {
    return {
      code: "RECHARGE_DB_COLUMN_MISSING",
      message: "充值数据字段不完整",
    };
  }
  if (/schema cache/i.test(message)) {
    return {
      code: "RECHARGE_DB_SCHEMA_CACHE_STALE",
      message: "数据库结构缓存尚未刷新",
    };
  }
  if (
    status === "401"
    || code === "401"
    || /(?:\bjwt\b|authentication|not authenticated|unauthorized)/i.test(message)
  ) {
    return {
      code: "RECHARGE_AUTH_CONTEXT_FAILED",
      message: "登录状态或数据库认证上下文异常",
    };
  }
  return {
    code: "RECHARGE_DB_QUERY_FAILED",
    message: "充值记录读取失败",
  };
}

export function normalizeChannelRow(row: AnyRow): PaymentChannel | null {
  const code = getCanonicalPaymentChannelCode(row);
  if (!isKnownChannel(code)) return null;
  if (getPaymentChannelPairValidationError({
    channel: row.channel,
    code: row.code,
    provider: row.provider,
    provider_name: row.provider_name,
    min_amount: row.min_amount,
    minimum_amount: row.minimum_amount,
  })) return null;

  if (row.currency !== "USDT" && row.currency !== "CNY") return null;
  const currency: PaymentCurrency = row.currency;
  const providerValue = row.provider;
  if (
    providerValue !== "generic_api"
    && providerValue !== "binance"
    && providerValue !== "crypto_address"
  ) return null;
  const provider = providerValue;
  const enabled = row.enabled === true;
  const publicConfig = row.public_config && typeof row.public_config === "object" ? row.public_config as Record<string, unknown> : {};
  const maximumAmountInput = publicConfig.maximum_amount
    ?? (currency === "USDT" ? 100000 : 1000000);
  const validationError = getPaymentChannelValidationError({
    channel: code,
    currency,
    provider,
    feeRate: row.fee_rate,
    minimumAmount: row.minimum_amount ?? row.min_amount,
    maximumAmount: maximumAmountInput,
    network: row.network,
  });
  if (validationError) return null;
  const network = normalizeNetwork(row.network, code);
  const minimumAmount = finiteNumber(row.minimum_amount ?? row.min_amount);
  const feeRate = finiteNumber(row.fee_rate);
  const configured = row.configured === true;
  const reviewMode = paymentReviewMode(publicConfig);
  const paymentAddress = textOrNull(publicConfig.payment_address);
  const tokenContract = textOrNull(
    publicConfig.token_contract,
  );
  const paymentInstructions = textOrNull(
    publicConfig.payment_instructions,
  );
  const available = isPublicPaymentChannelReady({
    channel: code,
    provider: row.provider ?? row.provider_name,
    enabled,
    configured,
    reviewMode,
    paymentAddress,
    tokenContract,
    paymentInstructions,
  });
  const manualPayment = getSafePublicManualPaymentForRow(row, {
    channel: code,
    provider: row.provider ?? row.provider_name,
    enabled,
    configured,
    reviewMode,
    paymentAddress,
    tokenContract,
    paymentInstructions,
  });

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
    status: available ? "active" : "disabled",
    enabled: available,
    configured,
    reviewMode,
    maximumAmount: finiteNumber(maximumAmountInput),
    provider,
    sort_order: Math.trunc(finiteNumber(row.sort_order, 100)),
    iconSrc: channelIcon(code),
    manualPayment,
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
    requestedCnyAmount: decimalTextOrNull(row.requested_cny_amount),
    expectedUsdtAmount: decimalTextOrNull(row.expected_usdt_amount),
    actualReceivedUsdt: decimalTextOrNull(row.actual_received_usdt),
    creditedCnyAmount: decimalTextOrNull(row.credited_cny_amount),
    lockedMarketRate: decimalTextOrNull(row.locked_market_rate),
    lockedSettlementRate: decimalTextOrNull(row.locked_settlement_rate),
    rateSource: textOrNull(row.rate_source),
    rateEffectiveDate: textOrNull(row.rate_effective_date),
    rateLockedAt: textOrNull(row.rate_locked_at),
    expiresAt: textOrNull(row.expires_at),
    matchedAt: textOrNull(row.matched_at),
    matchMethod: textOrNull(row.match_method),
    paymentAddress: textOrNull(row.payment_address),
    paymentTokenContract: textOrNull(row.payment_token_contract),
    status,
    createdAt: String(row.created_at ?? ""),
    paidAt: textOrNull(row.paid_at),
    completedAt: textOrNull(row.completed_at ?? row.paid_at),
    reviewReason: textOrNull(row.review_reason ?? row.error_summary),
  };
}

function decimalTextOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return textOrNull(value);
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

function getErrorProperty(error: unknown, property: "code" | "status") {
  if (!error || typeof error !== "object" || !(property in error)) return "";
  const value = (error as Record<string, unknown>)[property];
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}
