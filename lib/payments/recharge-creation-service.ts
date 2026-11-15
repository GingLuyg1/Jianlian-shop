import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentChannel } from "@/lib/payments/channel-types";
import { getSafeErrorMessage } from "@/lib/payments/payment-errors";
import { parseRechargeStatusStrict } from "@/lib/recharges/status-machine";
import { normalizeChannelRow } from "@/lib/payments/recharge-utils";
import { calculateRechargeAmounts } from "@/lib/payments/channels";
import { getPaymentProviderCapabilities } from "@/lib/payments/providers";
import { providerAmountWithinLimits, providerSupportsChannel } from "@/lib/payments/provider-contracts.mjs";
import { evaluateRechargeRisk, shouldBlockRisk } from "@/lib/risk/risk-service";
import { assertUserBusinessAllowed } from "@/lib/users/account-guard";
import { createAccountRechargeExpiryWindow } from "@/lib/payments/account-recharge-expiry.mjs";

export async function prepareCanaryRecharge(input: { service: SupabaseClient; userId: string; userEmail: string; channelCode: "alipay" | "wechat"; logicalKey: string }) {
  await assertUserBusinessAllowed(input.service, input.userId, "create_recharge");
  const existing = await findExistingRecharge(input.service, input.userId, input.logicalKey);
  if (existing && ["pending", "waiting_payment", "processing"].includes(existing.status)) return { ...existing, created: false };
  if (existing) throw new Error("CANARY_RECHARGE_DUPLICATE_NON_PAYABLE");
  const { data, error } = await input.service.from("payment_channels").select("channel,code,enabled,configured,display_name,currency,network,min_amount,minimum_amount,fee_rate,provider,provider_name,public_config,sort_order").or(`code.eq.${input.channelCode},channel.eq.${input.channelCode}`).eq("configured", true).maybeSingle();
  if (error) throw error;
  const channel = data ? normalizeChannelRow(data as Record<string, unknown>) : null;
  if (!channel || channel.provider !== "snpay" || channel.code !== input.channelCode || channel.currency !== "CNY") throw new Error("CANARY_CHANNEL_NOT_CONFIGURED");
  const amount = 1;
  const summary = calculateRechargeAmounts(channel, amount);
  if (channel.feeRate !== 0 || summary.fee !== 0 || summary.payableAmount !== amount) throw new Error("CANARY_SNPAY_FEE_CONFIGURATION_INVALID");
  const caps = getPaymentProviderCapabilities(channel.provider);
  if (!providerSupportsChannel(caps, channel.code, channel.currency) || !providerAmountWithinLimits(caps, channel, amount)) throw new Error("CANARY_AMOUNT_UNSUPPORTED");
  const risk = await evaluateRechargeRisk({ supabase: input.service, request: new Request("https://jianlian.shop/internal/snpay-canary"), userId: input.userId, businessId: input.logicalKey, requestId: input.logicalKey, orderAmount: amount, currency: "CNY", paymentChannel: channel.code, riskContext: { provider: channel.provider, payable_amount: amount } });
  if (shouldBlockRisk(risk) || risk.recommended_action === "require_review") throw new Error("CANARY_RISK_BLOCKED");
  const window = createAccountRechargeExpiryWindow();
  const rechargeNo = await insertRecharge(input.service, { rechargeId: null, createdAt: window.createdAt, expiresAt: window.expiresAt, userId: input.userId, userEmail: input.userEmail, channel, amount, fee: 0, payableAmount: amount, clientRequestId: input.logicalKey, customerNote: "SNPAY production canary", rateSnapshot: null });
  return { rechargeNo, status: "pending", amount, payableAmount: amount, expiresAt: window.expiresAt, created: true };
}

export const REUSABLE_RECHARGE_STATUSES = ["pending", "waiting_payment", "submitted", "reviewing", "approved", "processing", "failed", "rejected", "succeeded", "paid"] as const;

export async function findExistingRecharge(supabase: SupabaseClient, userId: string, clientRequestId: string) {
  const { data, error } = await supabase.from("account_recharges")
    .select("recharge_no,status,amount,requested_amount,fee_amount,payable_amount,requested_cny_amount,expected_usdt_amount,locked_market_rate,locked_settlement_rate,rate_source,rate_effective_date,expires_at")
    .eq("user_id", userId).eq("client_request_id", clientRequestId)
    .in("status", [...REUSABLE_RECHARGE_STATUSES]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) { if (isMissingClientRequestColumn(error)) return null; throw error; }
  if (!data) return null;
  const status = parseRechargeStatusStrict(data.status);
  if (!status) throw new Error("invalid recharge status");
  return { rechargeNo: String(data.recharge_no ?? ""), status, amount: finiteNumber(data.requested_amount ?? data.amount), fee: finiteNumber(data.fee_amount), payableAmount: finiteNumber(data.payable_amount), requestedCnyAmount: data.requested_cny_amount ? String(data.requested_cny_amount) : null, expectedUsdtAmount: data.expected_usdt_amount ? String(data.expected_usdt_amount) : null, lockedMarketRate: data.locked_market_rate ? String(data.locked_market_rate) : null, lockedSettlementRate: data.locked_settlement_rate ? String(data.locked_settlement_rate) : null, rateSource: data.rate_source ? String(data.rate_source) : null, rateEffectiveDate: data.rate_effective_date ? String(data.rate_effective_date) : null, expiresAt: data.expires_at ? String(data.expires_at) : null, reused: true };
}

export async function insertRecharge(serviceClient: SupabaseClient, input: { rechargeId: string | null; createdAt: string | null; expiresAt: string | null; userId: string; userEmail: string | null; channel: PaymentChannel; amount: number; fee: number; payableAmount: number; clientRequestId: string; customerNote: string; rateSnapshot?: { requestedCnyAmount: string; expectedUsdtAmount: string; marketRate: string; settlementRate: string; source: string; effectiveDate: string; effectiveAt: string } | null; }) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rechargeNo = generateRechargeNo();
    const row = { ...(input.rechargeId ? { id: input.rechargeId } : {}), ...(input.createdAt ? { created_at: input.createdAt } : {}), recharge_no: rechargeNo, user_id: input.userId, user_email: input.userEmail, channel: input.channel.code, channel_code: input.channel.code, channel_name: input.channel.name, provider: input.channel.provider, currency: input.rateSnapshot ? "CNY" : input.channel.currency, network: input.channel.networkLabel ?? null, amount: input.rateSnapshot?.requestedCnyAmount ?? input.amount, requested_amount: input.rateSnapshot?.requestedCnyAmount ?? input.amount, fee_amount: input.rateSnapshot ? "0.00" : input.fee, payable_amount: input.rateSnapshot?.requestedCnyAmount ?? input.payableAmount, received_amount: 0, credited_amount: 0, status: input.channel.reviewMode === "manual" ? "waiting_payment" : "pending", client_request_id: input.clientRequestId, payment_method: input.channel.code, review_mode: input.channel.reviewMode ?? "provider", customer_note: input.customerNote || null, user_note: input.customerNote || null, expires_at: input.expiresAt, ...(input.rateSnapshot ? { settlement_currency: "USDT", requested_cny_amount: input.rateSnapshot.requestedCnyAmount, expected_usdt_amount: input.rateSnapshot.expectedUsdtAmount, locked_market_rate: input.rateSnapshot.marketRate, locked_settlement_rate: input.rateSnapshot.settlementRate, rate_source: input.rateSnapshot.source, rate_effective_date: input.rateSnapshot.effectiveDate, rate_effective_at: input.rateSnapshot.effectiveAt, rate_locked_at: new Date().toISOString(), payment_address: input.channel.manualPayment?.payment_address ?? null, payment_token_contract: input.channel.manualPayment?.token_contract ?? null } : {}) };
    const result = await serviceClient.from("account_recharges").insert(row);
    if (!result.error) return rechargeNo;
    lastError = result.error;
    if (isMissingClientRequestColumn(result.error)) {
      const retryRow = { ...row } as Record<string, unknown>; delete retryRow.client_request_id;
      const retry = await serviceClient.from("account_recharges").insert(retryRow);
      if (!retry.error) return rechargeNo;
      lastError = retry.error;
    }
    if ((lastError as { code?: string })?.code === "23505") {
      const existing = await findExistingRecharge(serviceClient, input.userId, input.clientRequestId);
      if (existing?.rechargeNo) return existing.rechargeNo;
      continue;
    }
    break;
  }
  throw lastError ?? new Error("Recharge creation failed");
}

function generateRechargeNo() { const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14); return `RC${stamp}${Math.random().toString(36).slice(2, 8).toUpperCase()}`; }
function finiteNumber(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function isMissingClientRequestColumn(error: unknown) { return /client_request_id|42703|schema cache/i.test(getSafeErrorMessage(error, "")); }
