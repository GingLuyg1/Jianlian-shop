import "server-only";

import { readFileSync } from "node:fs";

import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  ProviderCallbackContext,
  ProviderCreatePaymentInput,
  ProviderCreatePaymentResult,
  ProviderParsedCallback,
  ProviderQueryPaymentOptions,
  ProviderQueryPaymentResult,
  RechargeStatus,
} from "@/lib/payments/channel-types";
import {
  createSnpayClient,
  getSnpayBusinessErrorDiagnostics,
  SnpayCoreError,
} from "@/lib/payments/providers/snpay-core.mjs";

const DEFAULT_API_BASE = "https://www.snpay.cn";
const DEFAULT_TIMEOUT_MS = 10_000;

export class SnpayProviderError extends Error {
  code: string;
  providerBusinessCode?: string;
  providerBusinessMessageSafe?: string;
  providerErrorResponseSignatureVerified?: boolean;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SnpayProviderError";
    this.code = code;
  }
}

function configuration() {
  const merchantId = String(process.env.SNPAY_MERCHANT_ID ?? "").trim();
  const privateKeyFile = String(process.env.SNPAY_PRIVATE_KEY_FILE ?? "").trim();
  const platformPublicKeyFile = String(process.env.SNPAY_PLATFORM_PUBLIC_KEY_FILE ?? "").trim();
  const siteUrl = httpsUrl(process.env.SNPAY_SITE_URL, "SNPAY 网站地址配置无效");
  if (!merchantId || !privateKeyFile || !platformPublicKeyFile) {
    throw new SnpayProviderError("SNPAY_NOT_CONFIGURED", "SNPAY 支付渠道尚未配置");
  }
  try {
    return {
      merchantId,
      apiBaseUrl: httpsUrl(process.env.SNPAY_API_BASE ?? DEFAULT_API_BASE, "SNPAY API 地址配置无效").toString(),
      merchantPrivateKey: readFileSync(privateKeyFile, "utf8"),
      platformPublicKey: readFileSync(platformPublicKeyFile, "utf8"),
      siteUrl,
      timeoutMs: boundedTimeout(process.env.SNPAY_TIMEOUT_MS),
    };
  } catch (error) {
    if (error instanceof SnpayProviderError) throw error;
    throw new SnpayProviderError("SNPAY_KEY_FILE_UNREADABLE", "SNPAY 密钥文件无法读取");
  }
}

function client() {
  try {
    return createSnpayClient(configuration());
  } catch (error) {
    if (error instanceof SnpayProviderError) throw error;
    if (error instanceof SnpayCoreError) throw new SnpayProviderError(error.code, error.message);
    throw new SnpayProviderError("SNPAY_CONFIGURATION_INVALID", "SNPAY 配置无效");
  }
}

async function createPayment(
  input: CreatePaymentInput | ProviderCreatePaymentInput,
): Promise<CreatePaymentResult | ProviderCreatePaymentResult> {
  if (!("sessionNo" in input) || typeof input.sessionNo !== "string") {
    throw new SnpayProviderError("SNPAY_UNIFIED_SESSION_REQUIRED", "SNPAY 支付必须通过统一支付会话创建");
  }
  if (input.currency !== "CNY") throw new SnpayProviderError("SNPAY_CURRENCY_INVALID", "SNPAY 仅支持人民币支付");
  if (!input.clientIp) throw new SnpayProviderError("SNPAY_CLIENT_IP_REQUIRED", "无法确认付款客户端 IP");
  const config = configuration();
  const notifyUrl = new URL(`/api/payments/callback/${input.channel.code}`, config.siteUrl).toString();
  const returnPath = input.businessType === "order"
    ? `/payment?order=${encodeURIComponent(input.businessNo)}`
    : `/payment?recharge=${encodeURIComponent(input.businessNo)}`;
  try {
    const result = await createSnpayClient(config).createPayment({
      sessionNo: input.sessionNo,
      channelCode: input.channel.code,
      notifyUrl,
      returnUrl: new URL(returnPath, config.siteUrl).toString(),
      subject: input.subject || `Jianlian ${input.businessType} ${input.businessNo}`,
      amount: input.payableAmount,
      clientIp: input.clientIp,
    });
    return {
      status: "pending",
      paymentType: result.paymentType as ProviderCreatePaymentResult["paymentType"],
      artifact: result.artifact as ProviderCreatePaymentResult["artifact"],
      paymentUrl: typeof result.paymentUrl === "string" ? result.paymentUrl : undefined,
      qrCodeValue: typeof result.qrCodeValue === "string" ? result.qrCodeValue : undefined,
      deepLinkUrl: typeof result.deepLinkUrl === "string" ? result.deepLinkUrl : undefined,
      providerOrderNo: result.providerOrderNo,
      expiresAt: input.expiresAt,
      metadata: { provider: "snpay", signatureVerified: true },
    };
  } catch (error) {
    throw providerError(error);
  }
}

async function queryPayment(
  paymentNo: string,
  options?: ProviderQueryPaymentOptions,
): Promise<{ status: RechargeStatus } | ProviderQueryPaymentResult> {
  if (!options?.expectedSessionNo || !options.expectedChannel || options.expectedAmount == null || !options.expectedCurrency) {
    throw new SnpayProviderError("SNPAY_QUERY_CONTEXT_REQUIRED", "SNPAY 查询缺少可信订单上下文");
  }
  if (options.expectedCurrency !== "CNY") {
    throw new SnpayProviderError("SNPAY_CURRENCY_INVALID", "SNPAY 查询仅支持人民币订单");
  }
  try {
    const result = await client().queryPayment({
      providerOrderNo: options.expectedProviderOrderNo ?? paymentNo,
      sessionNo: options.expectedSessionNo,
      channelCode: options.expectedChannel,
      amount: options.expectedAmount,
      options: { timeoutMs: options.timeoutMs },
    });
    const payload = result.payload as Record<string, unknown>;
    const providerTransactionId = boundedOptional(payload.trade_no, 160);
    return {
      status: result.status,
      found: result.found,
      paid: result.paid,
      providerChannel: options.expectedChannel,
      providerTransactionIdPresent: Boolean(providerTransactionId),
      providerTransactionId,
      providerPaidAt: boundedOptional(payload.endtime ?? payload.paid_at, 64),
      paidAt: result.paidAt ?? undefined,
      amount: payload.money as string | number,
      currency: "CNY",
      rawSummarySafe: {
        found: result.found,
        paid: result.paid,
        signatureVerified: true,
        timestampVerified: true,
        identityVerified: true,
        providerTransactionIdPresent: Boolean(providerTransactionId),
        providerPaidAtPresent: Boolean(result.paidAt),
      },
      rawSummary: {
        found: result.found,
        type: boundedOptional(payload.type, 32),
        outTradeNo: boundedOptional(payload.out_trade_no, 160),
        providerTradeNoPresent: Boolean(providerTransactionId),
        endtime: boundedOptional(payload.endtime ?? payload.paid_at, 64),
      },
    };
  } catch (error) {
    throw providerError(error);
  }
}

async function verifyCallback(_payload: unknown, context?: string | ProviderCallbackContext) {
  if (!context || typeof context === "string" || context.provider !== "snpay") return false;
  try {
    return client().verifyCallback(context.rawBody, { channelCode: context.channelCode });
  } catch {
    return false;
  }
}

async function parseCallback(_payload: unknown, context?: ProviderCallbackContext): Promise<ProviderParsedCallback> {
  if (!context || context.provider !== "snpay") throw new SnpayProviderError("SNPAY_CALLBACK_CONTEXT_INVALID", "SNPAY 回调上下文无效");
  try {
    const parsed = client().parseCallback(context.rawBody, { channelCode: context.channelCode });
    return {
      provider: "snpay",
      businessNo: parsed.sessionNo,
      sessionNo: parsed.sessionNo,
      providerOrderNo: parsed.providerTransactionId,
      providerTransactionId: parsed.providerTransactionId,
      status: parsed.status,
      amount: parsed.amount,
      currency: "CNY",
      channelCode: parsed.channelCode,
      paidAt: parsed.paidAt ?? undefined,
      rawSummary: {
        signatureVerified: true,
        providerTransactionIdPresent: true,
        providerPaidAtPresent: Boolean(parsed.paidAt),
      },
    };
  } catch (error) {
    throw providerError(error);
  }
}

function providerError(error: unknown) {
  if (error instanceof SnpayProviderError) return error;
  if (error instanceof SnpayCoreError) {
    const converted = new SnpayProviderError(error.code, error.message);
    Object.assign(converted, getSnpayBusinessErrorDiagnostics(error));
    return converted;
  }
  return new SnpayProviderError("SNPAY_REQUEST_FAILED", "SNPAY 请求失败");
}

function httpsUrl(value: unknown, message: string) {
  try {
    const parsed = new URL(String(value ?? ""));
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("invalid");
    return parsed;
  } catch {
    throw new SnpayProviderError("SNPAY_URL_INVALID", message);
  }
}

function boundedTimeout(value: unknown) {
  const parsed = Number(value ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(parsed) ? Math.min(30_000, Math.max(1_000, Math.round(parsed))) : DEFAULT_TIMEOUT_MS;
}

function boundedOptional(value: unknown, maxLength: number) {
  const text = String(value ?? "").trim();
  return text && text.length <= maxLength ? text : undefined;
}

export const snpayProvider: PaymentProvider = {
  createPayment,
  queryPayment,
  async closePayment() {
    throw new SnpayProviderError("SNPAY_CLOSE_UNSUPPORTED", "SNPAY Stage 1 暂不支持关闭支付单");
  },
  verifyCallback,
  parseCallback,
  formatCallbackResponse(result) {
    return new Response(result.ok ? "success" : "fail", {
      status: result.ok ? 200 : 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
