import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  PaymentBusinessType,
  PaymentClientDevice,
  PaymentChannel,
  PaymentCurrency,
  PaymentSessionStatus,
  PaymentSubmitForm,
  ProviderCreatePaymentResult,
} from "@/lib/payments/channel-types";
import { getSafeErrorMessage } from "@/lib/payments/payment-errors";
import { assertLiuhaoyiAmountBreakdown, isLiuhaoyiPaymentMethod } from "@/lib/payments/liuhaoyi-limits.mjs";
import { getPaymentProvider } from "@/lib/payments/providers";
import { normalizeLiuhaoyiSessionPresentation } from "@/lib/payments/providers/liuhaoyi-core.mjs";
import { normalizeLiuhaoyiSubmitForm } from "@/lib/payments/providers/liuhaoyi-submit.mjs";
import { isReusablePaymentSession } from "@/lib/payments/payment-session-reuse.mjs";
import { normalizeChannelRow } from "@/lib/payments/recharge-utils";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

const ACTIVE_SESSION_STATUSES: PaymentSessionStatus[] = ["pending", "processing"];
const INITIALIZATION_WAIT_ATTEMPTS = 8;
const INITIALIZATION_WAIT_MS = 250;

export const PAYMENT_SESSION_REUSE_IMPLEMENTED = true;

export class PaymentSessionError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PaymentSessionError";
    this.code = code;
  }
}

export type CreatePaymentSessionInput = {
  businessType: PaymentBusinessType;
  businessNo: string;
  channelCode: string;
  userId: string;
  clientIp?: string | null;
  clientDevice?: PaymentClientDevice;
};

export type PaymentSessionResponse = {
  sessionNo: string;
  status: "pending" | "processing";
  paymentType: "redirect" | "qrcode" | "address" | "deeplink";
  paymentUrl?: string;
  submitForm?: PaymentSubmitForm;
  qrCodeUrl?: string;
  qrCodeValue?: string;
  deepLinkUrl?: string;
  clientDevice?: PaymentClientDevice;
  walletAddress?: string;
  network?: string;
  currency: PaymentCurrency;
  requestedAmount: number;
  feeAmount: number;
  payableAmount: number;
  expiresAt: string;
};

export type PaymentSessionStatusResponse = {
  sessionNo: string;
  businessType: string;
  businessNo: string | null;
  channel: string;
  status: PaymentSessionStatus;
  providerTransactionId: string | null;
  paidAt: string | null;
  expiresAt: string | null;
};

type BusinessRecord = {
  id: string;
  businessNo: string;
  userId: string;
  status: string;
  paymentStatus?: string | null;
  requestedAmount: number;
  feeAmount: number;
  payableAmount: number;
  currency: PaymentCurrency;
  channelCode?: string | null;
  expiresAt?: string | null;
};

type ReservedSession = {
  created: boolean;
  session: Record<string, unknown>;
};

export async function createPaymentSession(input: CreatePaymentSessionInput): Promise<PaymentSessionResponse> {
  const service = getRequiredServiceClient();
  const businessType = normalizeBusinessType(input.businessType);
  const business = await loadBusinessRecord(service, businessType, input.businessNo, input.userId);
  ensureBusinessCanCreatePayment(business);

  const channelCode = normalizeChannelCode(input.channelCode || business.channelCode);
  const reusable = await getReusableSession(service, {
    businessType,
    business,
    channelCode,
  });
  if (reusable) {
    const existing = await waitForInitializedSession(service, reusable);
    assertReusableSessionMatches(existing, { businessType, business, channelCode });
    return toSessionResponse(existing);
  }

  const latest = await getLatestMatchingSession(service, {
    businessType,
    business,
    channelCode,
  });
  if (latest && (normalizeSessionStatus(latest.status) === "expired" || isExpiredAt(latest.expires_at))) {
    throw new PaymentSessionError("SESSION_EXPIRED", "原支付会话已过期，不能创建替代支付单");
  }

  const channel = await loadEnabledChannel(service, channelCode);
  if (!channel.configured) {
    throw new PaymentSessionError("PROVIDER_NOT_CONFIGURED", "支付渠道尚未配置，无法创建真实支付会话。");
  }
  if (isLiuhaoyiPaymentMethod(channel.code)) {
    if (business.currency !== "CNY") {
      throw new PaymentSessionError("LIUHAOYI_CURRENCY_INVALID", "支付宝/微信支付仅支持人民币订单");
    }
    try {
      assertLiuhaoyiAmountBreakdown(business.requestedAmount, business.feeAmount, business.payableAmount);
    } catch (error) {
      throw new PaymentSessionError("LIUHAOYI_AMOUNT_LIMIT_EXCEEDED", getSafeErrorMessage(error, "支付宝/微信支付金额无效"));
    }
    if (!input.clientIp) {
      throw new PaymentSessionError("LIUHAOYI_CLIENT_IP_REQUIRED", "无法确认付款客户端 IP");
    }
  }

  const sessionNo = generateSessionNo();
  const expiresAt = businessType === "recharge" && business.expiresAt
    ? business.expiresAt
    : new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const providerNetwork =
    channel.code === "usdt_trc20" ? "TRON" : channel.code === "usdt_bep20" ? "BSC" : channel.network;

  const reserved = await reservePaymentSession(service, {
    sessionNo,
    businessType,
    business,
    channel,
    network: providerNetwork,
    expiresAt,
  });

  if (!reserved.created) {
    const existing = await waitForInitializedSession(service, reserved.session);
    assertReusableSessionMatches(existing, { businessType, business, channelCode: channel.code, provider: channel.provider });
    return toSessionResponse(existing);
  }

  try {
    const providerResult = (await getPaymentProvider(channel.provider).createPayment({
      sessionNo,
      businessType,
      businessNo: business.businessNo,
      userId: input.userId,
      channel,
      currency: business.currency,
      network: providerNetwork,
      requestedAmount: business.requestedAmount,
      feeAmount: business.feeAmount,
      payableAmount: business.payableAmount,
      expiresAt,
      clientIp: input.clientIp ?? undefined,
      clientDevice: input.clientDevice,
    })) as ProviderCreatePaymentResult;

    const { data, error } = await service
      .from("payment_sessions")
      .update({
        status: providerResult.status,
        payment_type: providerResult.paymentType,
        payment_url: providerResult.paymentUrl ?? providerResult.deepLinkUrl ?? null,
        qr_code_url: providerResult.qrCodeValue ?? providerResult.qrCodeUrl ?? null,
        wallet_address: providerResult.walletAddress ?? null,
        provider_order_no: providerResult.providerOrderNo ?? null,
        expires_at: providerResult.expiresAt ?? expiresAt,
        metadata: { initializing: false, ...(providerResult.metadata ?? {}) },
        last_error: null,
      })
      .eq("session_no", sessionNo)
      .in("status", ACTIVE_SESSION_STATUSES)
      .select(sessionResponseSelect)
      .single();

    if (error) throw error;
    return toSessionResponse(data);
  } catch (error) {
    const message = getSafeErrorMessage(error, "支付渠道创建支付失败");
    await service
      .from("payment_sessions")
      .update({
        status: "failed",
        last_error: message,
        metadata: { initializing: false, errorCode: errorCode(error) },
      })
      .eq("session_no", sessionNo)
      .neq("status", "paid");
    throw error;
  }
}

export async function getPaymentSessionStatus(
  sessionNo: string,
  userId: string,
  isAdmin = false
): Promise<PaymentSessionStatusResponse> {
  const service = getRequiredServiceClient();
  const { data, error } = await service
    .from("payment_sessions")
    .select("session_no,business_type,business_no,channel_code,status,provider_transaction_id,paid_at,expires_at,user_id")
    .eq("session_no", sessionNo)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new PaymentSessionError("SESSION_NOT_FOUND", "支付会话不存在");
  if (!isAdmin && data.user_id !== userId) {
    throw new PaymentSessionError("SESSION_FORBIDDEN", "无权查看该支付会话");
  }

  let status = normalizeSessionStatus(data.status);
  if (["pending", "processing"].includes(status) && isExpiredAt(data.expires_at)) {
    const expiredAt = new Date().toISOString();
    const { error: expireError } = await service
      .from("payment_sessions")
      .update({ status: "expired", closed_at: expiredAt, last_error: "支付会话已过期" })
      .eq("session_no", sessionNo)
      .in("status", ACTIVE_SESSION_STATUSES);
    if (expireError) throw expireError;
    status = "expired";
    if (String(data.business_type) === "recharge" && isLiuhaoyiPaymentMethod(data.channel_code)) {
      const { error: rechargeExpireError } = await service
        .from("account_recharges")
        .update({ status: "expired", error_summary: "充值订单已过期" })
        .eq("recharge_no", data.business_no)
        .in("status", ["pending", "waiting_payment", "processing"]);
      if (rechargeExpireError) throw rechargeExpireError;
    }
  }

  return {
    sessionNo: String(data.session_no),
    businessType: String(data.business_type),
    businessNo: textOrNull(data.business_no),
    channel: String(data.channel_code),
    status,
    providerTransactionId: textOrNull(data.provider_transaction_id),
    paidAt: textOrNull(data.paid_at),
    expiresAt: textOrNull(data.expires_at),
  };
}

export async function closePaymentSession(sessionNo: string, userId: string) {
  const service = getRequiredServiceClient();
  const { data, error } = await service
    .from("payment_sessions")
    .select("id,session_no,status,user_id,provider,provider_order_no")
    .eq("session_no", sessionNo)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new PaymentSessionError("SESSION_NOT_FOUND", "支付会话不存在");
  if (data.user_id !== userId) throw new PaymentSessionError("SESSION_FORBIDDEN", "无权关闭该支付会话");
  if (data.status === "paid") throw new PaymentSessionError("SESSION_PAID", "已支付会话不能关闭");
  if (data.status === "closed" || data.status === "expired") {
    return { closed: true, status: data.status as PaymentSessionStatus };
  }

  if (data.provider && data.provider_order_no) {
    try {
      await getPaymentProvider(data.provider).closePayment(data.provider_order_no);
    } catch {
      // Local close remains authoritative when a provider does not support close.
    }
  }

  const { error: updateError } = await service
    .from("payment_sessions")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", data.id)
    .in("status", ["pending", "processing", "failed"]);

  if (updateError) throw updateError;
  return { closed: true, status: "closed" as PaymentSessionStatus };
}

const sessionResponseSelect =
  "session_no,business_type,business_id,business_no,user_id,status,payment_type,payment_url,qr_code_url,wallet_address,network,currency,requested_amount,fee_amount,payable_amount,expires_at,metadata,provider,channel_code";

async function reservePaymentSession(
  service: SupabaseClient,
  input: {
    sessionNo: string;
    businessType: "order" | "recharge";
    business: BusinessRecord;
    channel: PaymentChannel;
    network?: string;
    expiresAt: string;
  }
): Promise<ReservedSession> {
  const { data, error } = await service.rpc("reserve_payment_session", {
    p_session_no: input.sessionNo,
    p_business_type: input.businessType,
    p_business_id: input.business.id,
    p_business_no: input.business.businessNo,
    p_user_id: input.business.userId,
    p_channel_code: input.channel.code,
    p_provider: input.channel.provider,
    p_currency: input.business.currency,
    p_network: input.network ?? null,
    p_requested_amount: input.business.requestedAmount,
    p_fee_amount: input.business.feeAmount,
    p_payable_amount: input.business.payableAmount,
    p_expires_at: input.expiresAt,
  });

  if (!error && data && typeof data === "object") {
    const result = data as { created?: unknown; session?: unknown };
    if (result.session && typeof result.session === "object") {
      return { created: result.created === true, session: result.session as Record<string, unknown> };
    }
  }

  if (error && !isMissingFunction(error)) throw error;
  return reservePaymentSessionFallback(service, input);
}

async function reservePaymentSessionFallback(
  service: SupabaseClient,
  input: {
    sessionNo: string;
    businessType: "order" | "recharge";
    business: BusinessRecord;
    channel: PaymentChannel;
    network?: string;
    expiresAt: string;
  }
): Promise<ReservedSession> {
  await expireStaleSessions(service, input.businessType, input.business.id);
  const payload = {
    session_no: input.sessionNo,
    business_type: input.businessType,
    business_id: input.business.id,
    business_no: input.business.businessNo,
    user_id: input.business.userId,
    channel_code: input.channel.code,
    provider: input.channel.provider,
    currency: input.business.currency,
    network: input.network ?? null,
    requested_amount: input.business.requestedAmount,
    fee_amount: input.business.feeAmount,
    payable_amount: input.business.payableAmount,
    status: "processing",
    payment_type: "redirect",
    expires_at: input.expiresAt,
    metadata: { initializing: true },
  };
  const { data, error } = await service.from("payment_sessions").insert(payload).select(sessionResponseSelect).single();
  if (!error && data) return { created: true, session: data };
  if (!isUniqueViolation(error)) throw error;

  const existing = await getReusableSession(service, {
    businessType: input.businessType,
    business: input.business,
    channelCode: input.channel.code,
    provider: input.channel.provider,
  });
  if (!existing) throw error;
  return { created: false, session: existing };
}

async function waitForInitializedSession(service: SupabaseClient, initial: Record<string, unknown>) {
  let current = initial;
  for (let attempt = 0; attempt < INITIALIZATION_WAIT_ATTEMPTS; attempt += 1) {
    if (!isInitializing(current)) return current;
    await delay(INITIALIZATION_WAIT_MS);
    const { data, error } = await service
      .from("payment_sessions")
      .select(sessionResponseSelect)
      .eq("session_no", String(current.session_no))
      .maybeSingle();
    if (error) throw error;
    if (data) current = data;
  }
  return current;
}

function isInitializing(row: Record<string, unknown>) {
  const metadata = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};
  return metadata.initializing === true;
}

function getRequiredServiceClient() {
  const service = getSupabaseServiceRoleClient();
  if (!service) {
    throw new PaymentSessionError("SERVICE_ROLE_NOT_CONFIGURED", "服务端支付密钥未配置，无法执行可信支付操作。");
  }
  return service;
}

function normalizeBusinessType(value: PaymentBusinessType): "order" | "recharge" {
  if (value === "order") return "order";
  if (value === "recharge" || value === "account_recharge") return "recharge";
  throw new PaymentSessionError("BUSINESS_TYPE_INVALID", "支付业务类型不支持");
}

async function loadBusinessRecord(
  service: SupabaseClient,
  businessType: "order" | "recharge",
  businessNo: string,
  userId: string
): Promise<BusinessRecord> {
  const normalizedNo = businessNo.trim();
  if (!normalizedNo) throw new PaymentSessionError("BUSINESS_NO_REQUIRED", "缺少业务单号");

  if (businessType === "order") {
    const { data, error } = await service
      .from("orders")
      .select("id,order_no,user_id,status,payment_status,total_amount,currency")
      .eq("order_no", normalizedNo)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.user_id !== userId) {
      throw new PaymentSessionError("BUSINESS_NOT_FOUND", "订单不存在或无权支付");
    }
    return {
      id: String(data.id),
      businessNo: String(data.order_no),
      userId: String(data.user_id),
      status: String(data.status),
      paymentStatus: textOrNull(data.payment_status),
      requestedAmount: finiteNumber(data.total_amount),
      feeAmount: 0,
      payableAmount: finiteNumber(data.total_amount),
      currency: data.currency === "USDT" ? "USDT" : "CNY",
    };
  }

  const { data, error } = await service
    .from("account_recharges")
    .select("id,recharge_no,user_id,status,amount,requested_amount,fee_amount,payable_amount,currency,channel_code,channel,expires_at")
    .eq("recharge_no", normalizedNo)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.user_id !== userId) {
    throw new PaymentSessionError("BUSINESS_NOT_FOUND", "充值单不存在或无权支付");
  }

  return {
    id: String(data.id),
    businessNo: String(data.recharge_no),
    userId: String(data.user_id),
    status: String(data.status),
    requestedAmount: finiteNumber(data.requested_amount ?? data.amount),
    feeAmount: finiteNumber(data.fee_amount),
    payableAmount: finiteNumber(data.payable_amount),
    currency: data.currency === "USDT" ? "USDT" : "CNY",
    channelCode: textOrNull(data.channel_code ?? data.channel),
    expiresAt: textOrNull(data.expires_at),
  };
}

function ensureBusinessCanCreatePayment(record: BusinessRecord) {
  if (record.paymentStatus === "paid" || record.status === "paid") {
    throw new PaymentSessionError("BUSINESS_ALREADY_PAID", "业务单已支付，不能重复创建支付会话");
  }
  if (["cancelled", "closed", "expired", "refunded", "failed"].includes(record.status)) {
    throw new PaymentSessionError("BUSINESS_STATUS_INVALID", "当前业务单状态不允许创建支付会话");
  }
  if (isLiuhaoyiPaymentMethod(record.channelCode) && isExpiredAt(record.expiresAt)) {
    throw new PaymentSessionError("BUSINESS_STATUS_INVALID", "充值订单已过期，不能继续使用原支付单");
  }
  if (record.payableAmount <= 0) throw new PaymentSessionError("AMOUNT_INVALID", "支付金额无效");
}

function isExpiredAt(value: unknown) {
  const expiresAt = Date.parse(String(value ?? ""));
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

async function expireStaleSessions(service: SupabaseClient, businessType: string, businessId: string) {
  await service
    .from("payment_sessions")
    .update({ status: "expired", closed_at: new Date().toISOString() })
    .eq("business_type", businessType)
    .eq("business_id", businessId)
    .in("status", ACTIVE_SESSION_STATUSES)
    .lt("expires_at", new Date().toISOString());
}

type ReusableSessionIdentity = {
  businessType: "order" | "recharge";
  business: BusinessRecord;
  channelCode: string;
  provider?: string;
};

async function getReusableSession(service: SupabaseClient, identity: ReusableSessionIdentity) {
  let query = service
    .from("payment_sessions")
    .select(sessionResponseSelect)
    .eq("business_type", identity.businessType)
    .eq("business_id", identity.business.id)
    .eq("business_no", identity.business.businessNo)
    .eq("user_id", identity.business.userId)
    .eq("channel_code", identity.channelCode)
    .in("status", ACTIVE_SESSION_STATUSES)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  if (identity.provider) query = query.eq("provider", identity.provider);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

async function getLatestMatchingSession(service: SupabaseClient, identity: ReusableSessionIdentity) {
  let query = service
    .from("payment_sessions")
    .select(sessionResponseSelect)
    .eq("business_type", identity.businessType)
    .eq("business_id", identity.business.id)
    .eq("business_no", identity.business.businessNo)
    .eq("user_id", identity.business.userId)
    .eq("channel_code", identity.channelCode)
    .order("created_at", { ascending: false })
    .limit(1);
  if (identity.provider) query = query.eq("provider", identity.provider);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

function assertReusableSessionMatches(row: Record<string, unknown>, identity: ReusableSessionIdentity) {
  const matches = isReusablePaymentSession(row, {
    businessType: identity.businessType,
    businessId: identity.business.id,
    businessNo: identity.business.businessNo,
    userId: identity.business.userId,
    channelCode: identity.channelCode,
    provider: identity.provider,
  });
  if (!matches) {
    throw new PaymentSessionError("SESSION_REUSE_MISMATCH", "现有支付会话与当前业务不匹配，请刷新后重试");
  }
}

function normalizeChannelCode(value: string | null | undefined) {
  const channelCode = String(value ?? "").trim();
  if (!channelCode) throw new PaymentSessionError("CHANNEL_REQUIRED", "缺少支付渠道");
  return channelCode;
}

async function loadEnabledChannel(service: SupabaseClient, code: string | null | undefined): Promise<PaymentChannel> {
  const channelCode = normalizeChannelCode(code);

  const { data, error } = await service
    .from("payment_channels")
    .select("channel,code,enabled,display_name,currency,network,min_amount,minimum_amount,fee_rate,provider,provider_name,sort_order,configured,provider_config,public_config")
    .or(`code.eq.${channelCode},channel.eq.${channelCode}`)
    .eq("enabled", true)
    .maybeSingle();
  if (error) throw error;
  const channel = data ? normalizeChannelRow(data as Record<string, unknown>) : null;
  if (!channel || !channel.enabled) throw new PaymentSessionError("CHANNEL_DISABLED", "支付渠道未启用或不存在");

  channel.configured = data?.configured === true || hasProviderConfig(data?.provider_config);
  return channel;
}

function toSessionResponse(row: Record<string, unknown>): PaymentSessionResponse {
  const metadata = row.metadata && typeof row.metadata === "object"
    ? row.metadata as Record<string, unknown>
    : {};
  const artifact = normalizeLiuhaoyiSessionPresentation({
    provider: textOrUndefined(row.provider),
    channelCode: textOrUndefined(row.channel_code),
    paymentType: normalizePaymentType(row.payment_type),
    paymentUrl: textOrUndefined(row.payment_url),
    qrCodeUrl: textOrUndefined(row.qr_code_url),
  });
  const submitForm = row.provider === "liuhaoyi" && metadata.checkoutMode === "submit"
    ? normalizeLiuhaoyiSubmitForm(metadata.submitForm)
    : null;
  const validSubmitForm = submitForm && (row.channel_code === "wechat" || row.channel_code === "alipay")
    && submitForm.fields.out_trade_no === row.session_no
    && submitForm.fields.type === (row.channel_code === "wechat" ? "wxpay" : "alipay")
    && Number(submitForm.fields.money) === finiteNumber(row.payable_amount)
    ? submitForm
    : undefined;
  return {
    sessionNo: String(row.session_no),
    status: normalizeSessionStatus(row.status) === "processing" ? "processing" : "pending",
    paymentType: artifact.paymentType,
    paymentUrl: artifact.paymentUrl,
    submitForm: validSubmitForm,
    qrCodeUrl: artifact.qrCodeUrl,
    qrCodeValue: artifact.qrCodeValue,
    deepLinkUrl: artifact.deepLinkUrl,
    clientDevice: normalizeClientDevice(metadata.clientDevice),
    walletAddress: textOrUndefined(row.wallet_address),
    network: textOrUndefined(row.network),
    currency: row.currency === "USDT" ? "USDT" : "CNY",
    requestedAmount: finiteNumber(row.requested_amount),
    feeAmount: finiteNumber(row.fee_amount),
    payableAmount: finiteNumber(row.payable_amount),
    expiresAt: String(row.expires_at ?? ""),
  };
}

function normalizeSessionStatus(value: unknown): PaymentSessionStatus {
  return ["pending", "processing", "paid", "failed", "expired", "closed"].includes(String(value))
    ? (String(value) as PaymentSessionStatus)
    : "pending";
}

function normalizePaymentType(value: unknown): "redirect" | "qrcode" | "address" | "deeplink" {
  return value === "qrcode" || value === "address" || value === "deeplink" ? value : "redirect";
}

function normalizeClientDevice(value: unknown): PaymentClientDevice | undefined {
  return ["pc", "mobile", "wechat", "alipay"].includes(String(value))
    ? String(value) as PaymentClientDevice
    : undefined;
}

function generateSessionNo() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PS${stamp}${random}`;
}

function hasProviderConfig(value: unknown) {
  return Boolean(value && typeof value === "object" && Object.keys(value as Record<string, unknown>).length > 0);
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function textOrUndefined(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isMissingFunction(error: unknown) {
  return /reserve_payment_session|PGRST202|42883|schema cache/i.test(getSafeErrorMessage(error, ""));
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "23505");
}

function errorCode(error: unknown) {
  if (error instanceof PaymentSessionError) return error.code;
  if (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string") {
    return String((error as { code?: unknown }).code);
  }
  return "PAYMENT_CREATE_FAILED";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
