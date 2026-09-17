import "server-only";

import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  ProviderCallbackContext,
  ProviderCreatePaymentInput,
  ProviderCreatePaymentResult,
  ProviderParsedCallback,
  ProviderQueryPaymentResult,
  RechargeStatus,
} from "@/lib/payments/channel-types";
import { assertLiuhaoyiAmountBreakdown, assertLiuhaoyiPaymentAmount } from "@/lib/payments/liuhaoyi-limits.mjs";
import {
  createLiuhaoyiMd5Signature,
  extractLiuhaoyiCreateIdentity,
  isExpectedLiuhaoyiMerchant,
  liuhaoyiCallbackResponseBody,
  liuhaoyiChannelForType,
  liuhaoyiTypeForChannel,
  parseLiuhaoyiQuery,
  selectLiuhaoyiPaymentArtifact,
  verifyLiuhaoyiMd5Signature,
} from "@/lib/payments/providers/liuhaoyi-core.mjs";
import { normalizePaymentClientDevice } from "@/lib/payments/request-client-device.mjs";
import { paymentArtifactFromCreateResult } from "@/lib/payments/provider-contracts.mjs";
import { buildLiuhaoyiSubmitForm } from "@/lib/payments/providers/liuhaoyi-submit.mjs";

const DEFAULT_TIMEOUT_MS = 10_000;

type LiuhaoyiConfig = {
  merchantId: string;
  merchantKey: string;
  apiBaseUrl: URL;
  siteUrl: URL;
  timeoutMs: number;
  checkoutMode: "mapi" | "submit";
};

export class LiuhaoyiProviderError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LiuhaoyiProviderError";
    this.code = code;
  }
}

function configuration(): LiuhaoyiConfig {
  const merchantId = String(process.env.LIUHAOYI_MERCHANT_ID ?? "").trim();
  const merchantKey = String(process.env.LIUHAOYI_MERCHANT_KEY ?? "").trim();
  const apiBaseUrl = String(process.env.LIUHAOYI_API_BASE_URL ?? "").trim();
  const siteUrl = String(process.env.LIUHAOYI_SITE_URL ?? "").trim();
  const checkoutMode = String(process.env.LIUHAOYI_CHECKOUT_MODE ?? "mapi").trim();
  if (!merchantId || !merchantKey || !apiBaseUrl || !siteUrl) {
    throw new LiuhaoyiProviderError("LIUHAOYI_NOT_CONFIGURED", "六号易支付渠道尚未配置");
  }
  if (checkoutMode !== "mapi" && checkoutMode !== "submit") {
    throw new LiuhaoyiProviderError("LIUHAOYI_CHECKOUT_MODE_INVALID", "六号易结算模式配置无效");
  }
  return {
    merchantId,
    merchantKey,
    apiBaseUrl: httpsUrl(apiBaseUrl, "六号易 API 地址配置无效"),
    siteUrl: httpsUrl(siteUrl, "六号易网站回调地址配置无效"),
    timeoutMs: boundedTimeout(process.env.LIUHAOYI_TIMEOUT_MS),
    checkoutMode,
  };
}

function isUnifiedInput(input: CreatePaymentInput | ProviderCreatePaymentInput): input is ProviderCreatePaymentInput {
  return "sessionNo" in input && typeof input.sessionNo === "string";
}

async function createPayment(
  input: CreatePaymentInput | ProviderCreatePaymentInput
): Promise<CreatePaymentResult | ProviderCreatePaymentResult> {
  if (!isUnifiedInput(input)) {
    throw new LiuhaoyiProviderError("LIUHAOYI_UNIFIED_SESSION_REQUIRED", "六号易支付必须通过统一支付会话创建");
  }
  if (input.currency !== "CNY") {
    throw new LiuhaoyiProviderError("LIUHAOYI_CURRENCY_INVALID", "六号易仅支持人民币支付");
  }
  const config = configuration();
  let money: string;
  try {
    money = assertLiuhaoyiAmountBreakdown(input.requestedAmount, input.feeAmount, input.payableAmount);
  } catch {
    throw new LiuhaoyiProviderError("LIUHAOYI_FEE_CONFIGURATION_INVALID", "六号易支付不得由本站附加买家手续费");
  }
  const channelType = liuhaoyiTypeForChannel(input.channel.code);
  const clientDevice = normalizePaymentClientDevice(input.clientDevice);
  const clientIp = String(input.clientIp ?? "").trim();
  if (!clientIp) throw new LiuhaoyiProviderError("LIUHAOYI_CLIENT_IP_REQUIRED", "无法确认付款客户端 IP");

  const notifyUrl = new URL(`/api/payments/callback/${input.channel.code}`, config.siteUrl).toString();
  const returnPath = input.businessType === "order"
    ? `/payment?order=${encodeURIComponent(input.businessNo)}`
    : `/payment?recharge=${encodeURIComponent(input.businessNo)}`;
  const returnUrl = new URL(returnPath, config.siteUrl).toString();
  const subject = boundedText(input.subject || `Jianlian ${input.businessType} ${input.businessNo}`, 127);
  if (config.checkoutMode === "submit") {
    const submitForm = buildLiuhaoyiSubmitForm({
      apiBaseUrl: config.apiBaseUrl,
      merchantId: config.merchantId,
      merchantKey: config.merchantKey,
      channelCode: input.channel.code,
      sessionNo: input.sessionNo,
      notifyUrl,
      returnUrl,
      subject,
      money,
    });
    return {
      status: "pending",
      paymentType: "redirect",
      submitForm,
      expiresAt: input.expiresAt,
      metadata: { provider: "liuhaoyi", clientDevice, checkoutMode: "submit", submitForm },
    };
  }
  const unsigned = {
    pid: config.merchantId,
    type: channelType,
    out_trade_no: input.sessionNo,
    notify_url: notifyUrl,
    return_url: returnUrl,
    name: subject,
    money,
    clientip: clientIp,
    device: clientDevice,
  };
  const form = new URLSearchParams({
    ...unsigned,
    sign: createLiuhaoyiMd5Signature(unsigned, config.merchantKey),
    sign_type: "MD5",
  });

  const payload = await fetchJson(new URL("mapi.php", config.apiBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: form.toString(),
  }, config.timeoutMs, "六号易创建支付失败");
  if (String(payload.code ?? "") !== "1") {
    throw new LiuhaoyiProviderError("LIUHAOYI_CREATE_REJECTED", safeProviderMessage(payload, "六号易暂时无法创建支付单"));
  }

  const paymentArtifact = selectLiuhaoyiPaymentArtifact(payload);
  const createIdentity = extractLiuhaoyiCreateIdentity(payload);
  if (!paymentArtifact.paymentUrl && !paymentArtifact.qrCodeValue && !paymentArtifact.deepLinkUrl) {
    throw new LiuhaoyiProviderError("LIUHAOYI_PAYMENT_ARTIFACT_MISSING", "六号易未返回可用的付款信息");
  }
  return {
    status: "pending",
    ...paymentArtifact,
    artifact: paymentArtifactFromCreateResult(paymentArtifact) ?? undefined,
    ...createIdentity,
    expiresAt: input.expiresAt,
    metadata: { provider: "liuhaoyi", clientDevice },
  };
}

async function queryPayment(paymentNo: string): Promise<{ status: RechargeStatus } | ProviderQueryPaymentResult> {
  const config = configuration();
  const endpoint = new URL("api.php", config.apiBaseUrl);
  endpoint.searchParams.set("act", "order");
  endpoint.searchParams.set("pid", config.merchantId);
  endpoint.searchParams.set("key", config.merchantKey);
  endpoint.searchParams.set("out_trade_no", paymentNo);
  const payload = await fetchJson(endpoint, { method: "GET", cache: "no-store" }, config.timeoutMs, "六号易订单查询失败");
  const found = String(payload.code ?? "") === "1";
  const paid = found && String(payload.status ?? "") === "1";
  const providerTradeNo = boundedOptionalText(payload.trade_no, 160);
  const providerType = boundedOptionalText(payload.type, 32);
  const providerChannel = providerType === "wxpay" ? "wechat" : providerType === "alipay" ? "alipay" : undefined;
  const providerPaidAt = boundedOptionalText(payload.endtime, 64);
  return {
    status: paid ? "paid" : "pending",
    found,
    paid,
    providerChannel,
    providerTransactionIdPresent: Boolean(providerTradeNo),
    providerPaidAt,
    providerTransactionId: providerTradeNo,
    amount: typeof payload.money === "string" || typeof payload.money === "number" ? payload.money : undefined,
    currency: "CNY",
    rawSummarySafe: {
      found,
      paid,
      providerChannel: providerChannel ?? null,
      providerTransactionIdPresent: Boolean(providerTradeNo),
      providerPaidAtPresent: Boolean(providerPaidAt),
    },
    rawSummary: {
      found,
      paid,
      type: boundedOptionalText(payload.type, 32),
      outTradeNo: boundedOptionalText(payload.out_trade_no, 160),
      providerTradeNoPresent: Boolean(providerTradeNo),
      addtime: boundedOptionalText(payload.addtime, 64),
      endtime: boundedOptionalText(payload.endtime, 64),
    },
  };
}

function callbackParameters(context?: ProviderCallbackContext) {
  if (!context?.requestUrl) return {};
  return parseLiuhaoyiQuery(new URL(context.requestUrl).searchParams);
}

async function verifyCallback(_payload: unknown, context?: string | ProviderCallbackContext) {
  if (!context || typeof context === "string") return false;
  try {
    const config = configuration();
    const parameters = callbackParameters(context);
    return isExpectedLiuhaoyiMerchant(parameters, config.merchantId)
      && String(parameters.sign_type ?? "").toUpperCase() === "MD5"
      && verifyLiuhaoyiMd5Signature(parameters, config.merchantKey);
  } catch {
    return false;
  }
}

async function parseCallback(_payload: unknown, context?: ProviderCallbackContext): Promise<ProviderParsedCallback> {
  const config = configuration();
  const parameters = callbackParameters(context);
  const expectedChannel = context?.channelCode;
  const callbackChannel = liuhaoyiChannelForType(parameters.type);
  if (!isExpectedLiuhaoyiMerchant(parameters, config.merchantId)) throw new LiuhaoyiProviderError("LIUHAOYI_PID_MISMATCH", "六号易回调商户号不匹配");
  if (callbackChannel !== expectedChannel) throw new LiuhaoyiProviderError("LIUHAOYI_CHANNEL_MISMATCH", "六号易回调支付渠道不匹配");
  if (parameters.trade_status !== "TRADE_SUCCESS") throw new LiuhaoyiProviderError("LIUHAOYI_STATUS_INVALID", "六号易回调支付状态无效");
  const sessionNo = boundedOptionalText(parameters.out_trade_no, 160);
  const providerTransactionId = boundedOptionalText(parameters.trade_no, 160);
  if (!sessionNo || !providerTransactionId) throw new LiuhaoyiProviderError("LIUHAOYI_CALLBACK_ID_INVALID", "六号易回调缺少支付单号");
  const amount = assertLiuhaoyiPaymentAmount(parameters.money);
  return {
    provider: "liuhaoyi",
    businessNo: sessionNo,
    sessionNo,
    providerOrderNo: providerTransactionId,
    providerTransactionId,
    status: "paid",
    amount,
    currency: "CNY",
    channelCode: callbackChannel,
    rawSummary: { tradeStatus: "TRADE_SUCCESS", providerTransactionIdPresent: true },
  };
}

export const liuhaoyiProvider: PaymentProvider = {
  createPayment,
  queryPayment,
  async closePayment() {
    throw new LiuhaoyiProviderError("LIUHAOYI_CLOSE_UNSUPPORTED", "六号易 V1 暂不支持关闭支付单");
  },
  verifyCallback,
  parseCallback,
  formatCallbackResponse(result) {
    return new Response(liuhaoyiCallbackResponseBody(result.ok), {
      status: result.ok ? 200 : 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};

async function fetchJson(url: URL, init: RequestInit, timeoutMs: number, fallback: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || !payload) throw new LiuhaoyiProviderError("LIUHAOYI_HTTP_ERROR", fallback);
    return payload;
  } catch (error) {
    if (error instanceof LiuhaoyiProviderError) throw error;
    throw new LiuhaoyiProviderError("LIUHAOYI_REQUEST_FAILED", fallback);
  } finally {
    clearTimeout(timer);
  }
}

function httpsUrl(value: unknown, message: string) {
  try {
    const url = new URL(String(value ?? ""));
    if (url.protocol !== "https:") throw new Error("HTTPS required");
    return url;
  } catch {
    throw new LiuhaoyiProviderError("LIUHAOYI_URL_INVALID", message);
  }
}

function boundedTimeout(value: unknown) {
  const parsed = Number(value ?? DEFAULT_TIMEOUT_MS);
  return Number.isInteger(parsed) && parsed >= 1_000 && parsed <= 30_000 ? parsed : DEFAULT_TIMEOUT_MS;
}

function boundedText(value: unknown, maximum: number) {
  return String(value ?? "").trim().slice(0, maximum);
}

function boundedOptionalText(value: unknown, maximum: number) {
  const text = boundedText(value, maximum);
  return text || undefined;
}

function safeProviderMessage(payload: Record<string, unknown>, fallback: string) {
  const message = boundedOptionalText(payload.msg ?? payload.message, 160);
  return message && !/key|secret|sign|token|credential/i.test(message) ? message : fallback;
}
