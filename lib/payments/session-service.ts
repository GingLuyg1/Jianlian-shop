import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { calculateRechargeAmounts } from "@/lib/payments/channels";
import type {
  PaymentBusinessType,
  PaymentChannel,
  PaymentChannelCode,
  PaymentCurrency,
  PaymentSessionStatus,
  ProviderCreatePaymentResult,
} from "@/lib/payments/channel-types";
import { getPaymentProvider } from "@/lib/payments/providers";
import { normalizeChannelRow } from "@/lib/payments/recharge-utils";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

const ACTIVE_SESSION_STATUSES: PaymentSessionStatus[] = ["pending", "processing"];

export type CreatePaymentSessionInput = {
  businessType: PaymentBusinessType;
  businessNo: string;
  channelCode: string;
  userId: string;
};

export type PaymentSessionResponse = {
  sessionNo: string;
  status: "pending" | "processing";
  paymentType: "redirect" | "qrcode" | "address";
  paymentUrl?: string;
  qrCodeUrl?: string;
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
};

export async function createPaymentSession(input: CreatePaymentSessionInput): Promise<PaymentSessionResponse> {
  const service = getRequiredServiceClient();
  const businessType = normalizeBusinessType(input.businessType);
  const business = await loadBusinessRecord(service, businessType, input.businessNo, input.userId);

  ensureBusinessCanCreatePayment(business);

  await expireStaleSessions(service, businessType, business.id);

  const existing = await getReusableSession(service, businessType, business.id);
  if (existing) return toSessionResponse(existing);

  const channel = await loadEnabledChannel(service, input.channelCode || business.channelCode);
  if (!channel.configured) {
    throw new Error("支付渠道尚未配置，无法创建真实支付会话。");
  }

  const sessionNo = generateSessionNo();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const providerResult = (await getPaymentProvider(channel.provider).createPayment({
    sessionNo,
    businessType,
    businessNo: business.businessNo,
    userId: input.userId,
    channel,
    currency: business.currency,
    network: channel.network,
    requestedAmount: business.requestedAmount,
    feeAmount: business.feeAmount,
    payableAmount: business.payableAmount,
    expiresAt,
  })) as ProviderCreatePaymentResult;

  const insertPayload = {
    session_no: sessionNo,
    business_type: businessType,
    business_id: business.id,
    business_no: business.businessNo,
    user_id: input.userId,
    channel_code: channel.code,
    provider: channel.provider,
    currency: business.currency,
    network: channel.network ?? null,
    requested_amount: business.requestedAmount,
    fee_amount: business.feeAmount,
    payable_amount: business.payableAmount,
    status: providerResult.status,
    payment_type: providerResult.paymentType,
    payment_url: providerResult.paymentUrl ?? null,
    qr_code_url: providerResult.qrCodeUrl ?? null,
    wallet_address: providerResult.walletAddress ?? null,
    provider_order_no: providerResult.providerOrderNo ?? null,
    expires_at: providerResult.expiresAt ?? expiresAt,
  };

  const { data, error } = await service
    .from("payment_sessions")
    .insert(insertPayload)
    .select("session_no,status,payment_type,payment_url,qr_code_url,wallet_address,network,currency,requested_amount,fee_amount,payable_amount,expires_at")
    .single();

  if (error) throw error;
  return toSessionResponse(data);
}

export async function getPaymentSessionStatus(sessionNo: string, userId: string, isAdmin = false): Promise<PaymentSessionStatusResponse> {
  const service = getRequiredServiceClient();
  let query = service
    .from("payment_sessions")
    .select("session_no,business_type,business_no,channel_code,status,provider_transaction_id,paid_at,expires_at,user_id")
    .eq("session_no", sessionNo)
    .maybeSingle();

  const { data, error } = await query;
  if (error) throw error;
  if (!data) throw new Error("支付会话不存在");
  if (!isAdmin && data.user_id !== userId) throw new Error("无权查看该支付会话");

  return {
    sessionNo: String(data.session_no),
    businessType: String(data.business_type),
    businessNo: textOrNull(data.business_no),
    channel: String(data.channel_code),
    status: normalizeSessionStatus(data.status),
    providerTransactionId: textOrNull(data.provider_transaction_id),
    paidAt: textOrNull(data.paid_at),
    expiresAt: textOrNull(data.expires_at),
  };
}

export async function closePaymentSession(sessionNo: string, userId: string) {
  const service = getRequiredServiceClient();
  const { data, error } = await service
    .from("payment_sessions")
    .select("id,session_no,status,user_id")
    .eq("session_no", sessionNo)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("支付会话不存在");
  if (data.user_id !== userId) throw new Error("无权关闭该支付会话");
  if (data.status === "paid") throw new Error("已支付会话不能关闭");
  if (data.status === "closed" || data.status === "expired") return { closed: true, status: data.status as PaymentSessionStatus };

  const { error: updateError } = await service
    .from("payment_sessions")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", data.id)
    .in("status", ["pending", "processing", "failed"]);

  if (updateError) throw updateError;
  return { closed: true, status: "closed" as PaymentSessionStatus };
}

function getRequiredServiceClient() {
  const service = getSupabaseServiceRoleClient();
  if (!service) throw new Error("服务端支付密钥未配置，无法执行可信支付操作。");
  return service;
}

function normalizeBusinessType(value: PaymentBusinessType): PaymentBusinessType {
  if (value === "order" || value === "recharge" || value === "account_recharge") return value;
  throw new Error("支付业务类型不支持");
}

async function loadBusinessRecord(
  service: SupabaseClient,
  businessType: PaymentBusinessType,
  businessNo: string,
  userId: string
): Promise<BusinessRecord> {
  const normalizedNo = businessNo.trim();
  if (!normalizedNo) throw new Error("缺少业务单号");

  if (businessType === "order") {
    const { data, error } = await service
      .from("orders")
      .select("id,order_no,user_id,status,payment_status,total_amount,currency")
      .eq("order_no", normalizedNo)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.user_id !== userId) throw new Error("订单不存在或无权支付");
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
    .select("id,recharge_no,user_id,status,amount,requested_amount,fee_amount,payable_amount,currency,channel_code,channel")
    .eq("recharge_no", normalizedNo)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.user_id !== userId) throw new Error("充值单不存在或无权支付");

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
  };
}

function ensureBusinessCanCreatePayment(record: BusinessRecord) {
  if (record.paymentStatus === "paid" || record.status === "paid") throw new Error("业务单已支付，不能重复创建支付会话");
  if (["cancelled", "closed", "expired", "refunded", "failed"].includes(record.status)) throw new Error("当前业务单状态不允许创建支付会话");
  if (record.payableAmount <= 0) throw new Error("支付金额无效");
}

async function expireStaleSessions(service: SupabaseClient, businessType: PaymentBusinessType, businessId: string) {
  await service
    .from("payment_sessions")
    .update({ status: "expired", closed_at: new Date().toISOString() })
    .eq("business_type", businessType)
    .eq("business_id", businessId)
    .in("status", ACTIVE_SESSION_STATUSES)
    .lt("expires_at", new Date().toISOString());
}

async function getReusableSession(service: SupabaseClient, businessType: PaymentBusinessType, businessId: string) {
  const { data, error } = await service
    .from("payment_sessions")
    .select("session_no,status,payment_type,payment_url,qr_code_url,wallet_address,network,currency,requested_amount,fee_amount,payable_amount,expires_at")
    .eq("business_type", businessType)
    .eq("business_id", businessId)
    .in("status", ACTIVE_SESSION_STATUSES)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadEnabledChannel(service: SupabaseClient, code: string | null | undefined): Promise<PaymentChannel> {
  const channelCode = String(code ?? "").trim();
  if (!channelCode) throw new Error("缺少支付渠道");

  const { data, error } = await service
    .from("payment_channels")
    .select("channel,code,enabled,display_name,currency,network,min_amount,minimum_amount,fee_rate,provider,provider_name,sort_order,configured,provider_config,public_config")
    .or(`code.eq.${channelCode},channel.eq.${channelCode}`)
    .eq("enabled", true)
    .maybeSingle();
  if (error) throw error;
  const channel = data ? normalizeChannelRow(data as Record<string, unknown>) : null;
  if (!channel || !channel.enabled) throw new Error("支付渠道未启用或不存在");

  channel.configured = data?.configured === true || hasProviderConfig(data?.provider_config) || hasProviderConfig(data?.public_config);
  if (channel.code === "usdt_trc20") channel.network = "TRC20";
  if (channel.code === "usdt_bep20") channel.network = "BEP20";
  return channel;
}

function toSessionResponse(row: Record<string, unknown>): PaymentSessionResponse {
  return {
    sessionNo: String(row.session_no),
    status: normalizeSessionStatus(row.status) === "processing" ? "processing" : "pending",
    paymentType: normalizePaymentType(row.payment_type),
    paymentUrl: textOrUndefined(row.payment_url),
    qrCodeUrl: textOrUndefined(row.qr_code_url),
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

function normalizePaymentType(value: unknown): "redirect" | "qrcode" | "address" {
  return value === "qrcode" || value === "address" ? value : "redirect";
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
