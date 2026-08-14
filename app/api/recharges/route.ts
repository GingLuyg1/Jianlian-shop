import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { calculateRechargeAmounts } from "@/lib/payments/channels";
import {
  buildRechargePublicFailure,
  buildRechargeSafeLogFields,
} from "@/lib/payments/recharge-api-failure.mjs";
import type { PaymentChannel, RechargeStatus } from "@/lib/payments/channel-types";
import { getPaymentProvider } from "@/lib/payments/providers";
import {
  calculateExpectedUsdtAmount,
  compareRechargeDecimals,
  parseRequestedCnyAmount,
} from "@/lib/payments/recharge-rate.mjs";
import { loadCurrentRechargeDailyRate } from "@/lib/payments/recharge-rate-service";
import {
  classifyPublicRechargeAmountRange,
  isKnownPaymentChannelCode,
  parsePublicRechargeAmount,
  paymentChannelMatchesRequest,
} from "@/lib/payments/manual-channel-readiness.mjs";
import {
  isRechargeChannelAvailable,
} from "@/lib/payments/manual-channel-readiness.mjs";
import {
  RECHARGE_STATUSES,
  getPaymentErrorMessage,
  normalizeChannelRow,
  normalizeRechargeRow,
} from "@/lib/payments/recharge-utils";
import { evaluateRechargeRisk, riskResponseMessage, shouldBlockRisk } from "@/lib/risk/risk-service";
import { checkRateLimit, checkRequestSize, getUserRateLimitKey } from "@/lib/security/rate-limit";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { assertUserBusinessAllowed, isAccountRestrictionError } from "@/lib/users/account-guard";
import { parseRechargeStatusStrict } from "@/lib/recharges/status-machine";

export const dynamic = "force-dynamic";

const rechargeSelect =
  "recharge_no,channel,channel_code,channel_name,currency,network,amount,requested_amount,fee_amount,payable_amount,received_amount,credited_amount,payment_address,payment_token_contract,requested_cny_amount,expected_usdt_amount,actual_received_usdt,credited_cny_amount,locked_market_rate,locked_settlement_rate,rate_source,rate_effective_date,rate_locked_at,expires_at,matched_at,match_method,status,created_at,paid_at,completed_at,review_reason,error_summary";
const allowedCreateKeys = new Set(["channel", "payment_method", "amount", "currency", "customer_note", "client_request_id", "clientRequestId"]);
const reusableRechargeStatuses = [
  "pending",
  "waiting_payment",
  "submitted",
  "reviewing",
  "approved",
  "processing",
  "failed",
  "rejected",
  "succeeded",
  "paid",
];

export async function GET(request: Request) {
  const context = await requireUser();
  if (!context.ok) return context.response;
  const { searchParams } = new URL(request.url);
  const page = positiveInteger(searchParams.get("page"), 1);
  const pageSize = Math.min(100, positiveInteger(searchParams.get("pageSize"), 10));
  const status = searchParams.get("status") ?? "all";
  const channel = searchParams.get("channel") ?? "all";
  if (channel !== "all" && !isKnownPaymentChannelCode(channel)) {
    return NextResponse.json(
      {
        error: "请选择有效的充值渠道。",
        code: "RECHARGE_CHANNEL_INVALID",
      },
      { status: 400 },
    );
  }

  try {
    let query = context.supabase
      .from("account_recharges")
      .select(rechargeSelect, { count: "exact" })
      .eq("user_id", context.user.id)
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (status !== "all" && RECHARGE_STATUSES.includes(status as RechargeStatus)) query = query.eq("status", status);
    if (channel !== "all") query = query.or(`channel_code.eq.${channel},channel.eq.${channel}`);
    const { data, error, count } = await query;
    if (error) throw error;
    return NextResponse.json({
      data: ((data ?? []) as Record<string, unknown>[]).map(normalizeRechargeRow),
      count: count ?? 0,
      page,
      pageSize,
    });
  } catch (error) {
    return paymentFailure(error, "list");
  }
}

export async function POST(request: Request) {
  const context = await requireUser();
  if (!context.ok) return context.response;

  const sizeError = checkRequestSize(request, 12 * 1024);
  if (sizeError) return sizeError;
  const rateLimit = checkRateLimit("recharge_create", getUserRateLimitKey(context.user.id, "recharge_create"));
  if (!rateLimit.allowed) return rateLimit.response!;

  try {
    await assertUserBusinessAllowed(context.supabase, context.user.id, "create_recharge");
  } catch (guardError) {
    if (isAccountRestrictionError(guardError)) {
      return NextResponse.json({ error: guardError.message, code: guardError.code }, { status: guardError.status });
    }
    return paymentFailure(guardError, "risk");
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || Object.keys(body).some((key) => !allowedCreateKeys.has(key))) {
    return NextResponse.json({ error: "Invalid recharge request parameters." }, { status: 400 });
  }

  const channelValue = body.channel ?? body.payment_method;
  const channelCode = typeof channelValue === "string" ? channelValue.trim() : "";
  const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
  const customerNote = typeof body.customer_note === "string" ? body.customer_note.trim() : "";
  const rawAmount = parsePublicRechargeAmount(body.amount, 6);
  const requestedCnyAmount = parseRequestedCnyAmount(body.amount);
  const clientRequestId = normalizeRequestId(body.client_request_id ?? body.clientRequestId);
  if (!isKnownPaymentChannelCode(channelCode)) {
    return NextResponse.json(
      {
        error: "Please select a valid payment channel.",
        code: "RECHARGE_CHANNEL_INVALID",
      },
      { status: 400 },
    );
  }
  if (rawAmount === null) {
    return NextResponse.json(
      {
        error: "充值金额格式无效",
        code: "RECHARGE_AMOUNT_INVALID",
      },
      { status: 400 },
    );
  }
  if (!clientRequestId) {
    return NextResponse.json({ error: "Missing valid recharge request id." }, { status: 400 });
  }
  if (customerNote.length > 500) return NextResponse.json({ error: "Recharge note cannot exceed 500 characters." }, { status: 400 });

  let failureOperation: "channel" | "risk" | "create" = "create";
  try {
    const existing = await findExistingRecharge(context.supabase, context.user.id, clientRequestId);
    if (existing) return NextResponse.json(existing, { status: 200 });

    failureOperation = "channel";
    const { data: channelData, error: channelError } = await context.supabase
      .from("payment_channels")
      .select("channel,code,enabled,configured,display_name,currency,network,min_amount,minimum_amount,fee_rate,provider,provider_name,public_config,sort_order")
      .or(`code.eq.${channelCode},channel.eq.${channelCode}`)
      .eq("enabled", true)
      .eq("configured", true)
      .maybeSingle();
    if (channelError) throw channelError;
    const channel = channelData ? normalizeChannelRow(channelData as Record<string, unknown>) : null;
    if (
      !channel
      || !paymentChannelMatchesRequest(
        channelCode,
        channelData as Record<string, unknown>,
        channel.channel_code,
      )
      || !isRechargeChannelAvailable(channel)
    ) {
      return NextResponse.json(
        { error: "Payment channel is not available." },
        { status: 400 },
      );
    }
    const isUsdtCnyRecharge = channel.code === "usdt_bep20";
    if (isUsdtCnyRecharge && channel.reviewMode !== "manual") {
      return NextResponse.json(
        { error: "USDT-BEP20 账号充值仅支持人工审核模式", code: "RECHARGE_REVIEW_MODE_INVALID" },
        { status: 400 },
      );
    }
    if (!isUsdtCnyRecharge && currency && currency !== channel.currency) {
      return NextResponse.json({ error: "Recharge currency does not match payment channel." }, { status: 400 });
    }
    if (channel.currency === "USDT" && !isUsdtCnyRecharge) {
      return NextResponse.json(
        { error: "该 USDT 充值渠道尚未支持人民币余额换算", code: "RECHARGE_SETTLEMENT_UNSUPPORTED" },
        { status: 400 },
      );
    }
    if (isUsdtCnyRecharge && (currency && currency !== "CNY")) {
      return NextResponse.json(
        { error: "账号充值金额必须使用人民币", code: "RECHARGE_CURRENCY_INVALID" },
        { status: 400 },
      );
    }

    const serviceClient = getSupabaseServiceRoleClient();
    if (!serviceClient) {
      return paymentFailure(null, "service");
    }
    const rate = isUsdtCnyRecharge ? await loadCurrentRechargeDailyRate(serviceClient) : null;
    if (isUsdtCnyRecharge && (!requestedCnyAmount || !rate)) {
      return NextResponse.json(
        { error: rate ? "充值人民币金额格式无效" : "今日充值汇率尚未设置", code: rate ? "RECHARGE_AMOUNT_INVALID" : "RECHARGE_RATE_NOT_CONFIGURED" },
        { status: rate ? 400 : 503 },
      );
    }
    const theoreticalUsdtAmount = rate && requestedCnyAmount
      ? calculateExpectedUsdtAmount(requestedCnyAmount, String(rate.settlement_rate))
      : null;
    if (isUsdtCnyRecharge && !theoreticalUsdtAmount) {
      return NextResponse.json({ error: "充值换算失败", code: "RECHARGE_RATE_INVALID" }, { status: 503 });
    }

    const summary = isUsdtCnyRecharge ? null : calculateRechargeAmounts(channel, rawAmount);
    const amountRange = isUsdtCnyRecharge && theoreticalUsdtAmount
      ? classifyExactRange(theoreticalUsdtAmount, channel.minimumAmount, channel.maximumAmount ?? 0)
      : summary
        ? classifyPublicRechargeAmountRange(summary.amount, channel.minimumAmount, channel.maximumAmount)
        : "invalid";
    if (amountRange === "invalid") {
      return NextResponse.json({ error: "充值金额格式无效", code: "RECHARGE_AMOUNT_INVALID" }, { status: 400 });
    }
    if (amountRange === "below_minimum") {
      return NextResponse.json(
        { error: `Minimum recharge amount for this channel is ${channel.minimumAmount} ${channel.currency}.` },
        { status: 400 }
      );
    }
    if (amountRange === "above_maximum") {
      return NextResponse.json({ error: `Single recharge amount cannot exceed ${channel.maximumAmount} ${channel.currency}.` }, { status: 400 });
    }

    failureOperation = "risk";
    const risk = await evaluateRechargeRisk({
      supabase: context.supabase,
      request,
      userId: context.user.id,
      businessId: clientRequestId,
      requestId: clientRequestId,
      orderAmount: rawAmount,
      currency: isUsdtCnyRecharge ? "CNY" : channel.currency,
      paymentChannel: channel.code,
      riskContext: {
        provider: channel.provider,
        payable_amount: isUsdtCnyRecharge ? theoreticalUsdtAmount : summary?.payableAmount,
      },
    });

    if (shouldBlockRisk(risk) || risk.recommended_action === "require_review") {
      return NextResponse.json(
        {
          error: riskResponseMessage(risk),
          code: "RECHARGE_RISK_BLOCKED",
          risk: {
            level: risk.risk_level,
            score: risk.risk_score,
            action: risk.recommended_action,
            requestId: risk.request_id,
          },
        },
        { status: 403 }
      );
    }

    failureOperation = "create";

    let rechargeId: string | null = null;
    let expiresAt: string | null = null;
    let expectedUsdtAmount = theoreticalUsdtAmount;

    if (isUsdtCnyRecharge) {
      rechargeId = randomUUID();
      expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
      const paymentAddress = channel.manualPayment?.payment_address ?? "";
      if (!paymentAddress || !theoreticalUsdtAmount) {
        return NextResponse.json(
          { error: "USDT-BEP20 收款配置不完整", code: "RECHARGE_CHANNEL_CONFIG_INVALID" },
          { status: 503 },
        );
      }

      const { data: reservation, error: reservationError } = await serviceClient.rpc(
        "reserve_account_recharge_usdt_fingerprint_v3",
        {
          p_recharge_id: rechargeId,
          p_payment_address: paymentAddress,
          p_theoretical_usdt: theoreticalUsdtAmount,
          p_minimum_usdt: channel.minimumAmount,
          p_maximum_usdt: channel.maximumAmount ?? 0,
          p_expires_at: expiresAt,
        },
      );
      if (reservationError) throw reservationError;
      expectedUsdtAmount = getReservedFingerprintAmount(reservation);
      if (!expectedUsdtAmount) {
        return NextResponse.json(
          { error: "当前充值支付指纹暂时不可用，请稍后重试", code: "RECHARGE_FINGERPRINT_UNAVAILABLE" },
          { status: 503 },
        );
      }
    }

    let rechargeNo: string;
    try {
      rechargeNo = await insertRecharge(serviceClient, {
        rechargeId,
        expiresAt,
        userId: context.user.id,
        userEmail: context.user.email ?? null,
        channel,
        amount: summary?.amount ?? rawAmount,
        fee: summary?.fee ?? 0,
        payableAmount: summary?.payableAmount ?? rawAmount,
        clientRequestId,
        customerNote,
        rateSnapshot: rate && requestedCnyAmount && expectedUsdtAmount ? {
          requestedCnyAmount,
          expectedUsdtAmount,
          marketRate: String(rate.market_rate),
          settlementRate: String(rate.settlement_rate),
          source: rate.source,
          effectiveDate: rate.effective_date,
          effectiveAt: rate.effective_at,
        } : null,
      });
    } catch (insertError) {
      if (rechargeId) {
        try {
          await serviceClient.rpc(
            "release_orphan_account_recharge_usdt_fingerprint_v3",
            {
              p_recharge_id: rechargeId,
            },
          );
        } catch {
          // Best-effort cleanup only; preserve the original recharge creation error.
        }
      }
      throw insertError;
    }

    const persistedRecharge = isUsdtCnyRecharge
      ? await findExistingRecharge(serviceClient, context.user.id, clientRequestId)
      : null;
    const finalExpectedUsdtAmount = persistedRecharge?.expectedUsdtAmount ?? expectedUsdtAmount;
    const finalExpiresAt = persistedRecharge?.expiresAt ?? expiresAt;

    if (channel.reviewMode === "manual") {
      return NextResponse.json({
        rechargeNo,
        status: "waiting_payment",
        amount: isUsdtCnyRecharge ? requestedCnyAmount : summary?.amount,
        requestedCnyAmount: isUsdtCnyRecharge ? requestedCnyAmount : null,
        expectedUsdtAmount: finalExpectedUsdtAmount,
        expiresAt: finalExpiresAt,
        lockedMarketRate: rate ? String(rate.market_rate) : null,
        lockedSettlementRate: rate ? String(rate.settlement_rate) : null,
        rateSource: rate?.source ?? null,
        rateEffectiveDate: rate?.effective_date ?? null,
        fee: isUsdtCnyRecharge ? "0.00" : summary?.fee,
        payableAmount: isUsdtCnyRecharge ? finalExpectedUsdtAmount : summary?.payableAmount,
        reviewMode: "manual",
      }, { status: 201 });
    }

    try {
      if (!summary) {
        return NextResponse.json({ error: "充值渠道结算模式无效", code: "RECHARGE_SETTLEMENT_INVALID" }, { status: 400 });
      }
      const result = await getPaymentProvider(channel.provider).createPayment({
        rechargeNo,
        channel,
        userId: context.user.id,
        amount: summary.amount,
        fee: summary.fee,
        payableAmount: summary.payableAmount,
      });
      return NextResponse.json(result, { status: 201 });
    } catch (providerError) {
      const providerRequestId = randomUUID();
      logRechargeFailure("create", providerRequestId, 503, providerError);
      return NextResponse.json(
        {
          error: "充值支付服务暂时不可用；申请可能已保留，请先刷新充值记录，勿重复提交。",
          code: "RECHARGE_SERVICE_UNAVAILABLE",
          requestId: providerRequestId,
        },
        { status: 503 }
      );
    }
  } catch (error) {
    return paymentFailure(error, failureOperation);
  }
}

async function findExistingRecharge(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  userId: string,
  clientRequestId: string
) {
  const { data, error } = await supabase
    .from("account_recharges")
    .select("recharge_no,status,amount,requested_amount,fee_amount,payable_amount,requested_cny_amount,expected_usdt_amount,locked_market_rate,locked_settlement_rate,rate_source,rate_effective_date,expires_at")
    .eq("user_id", userId)
    .eq("client_request_id", clientRequestId)
    .in("status", reusableRechargeStatuses)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingClientRequestColumn(error)) return null;
    throw error;
  }
  if (!data) return null;
  const status = parseRechargeStatusStrict(data.status);
  if (!status) throw new Error("invalid recharge status");
  return {
    rechargeNo: String(data.recharge_no ?? ""),
    status,
    amount: finiteNumber(data.requested_amount ?? data.amount),
    fee: finiteNumber(data.fee_amount),
    payableAmount: finiteNumber(data.payable_amount),
    requestedCnyAmount: data.requested_cny_amount ? String(data.requested_cny_amount) : null,
    expectedUsdtAmount: data.expected_usdt_amount ? String(data.expected_usdt_amount) : null,
    lockedMarketRate: data.locked_market_rate ? String(data.locked_market_rate) : null,
    lockedSettlementRate: data.locked_settlement_rate ? String(data.locked_settlement_rate) : null,
    rateSource: data.rate_source ? String(data.rate_source) : null,
    rateEffectiveDate: data.rate_effective_date ? String(data.rate_effective_date) : null,
    expiresAt: data.expires_at ? String(data.expires_at) : null,
    reused: true,
  };
}

async function insertRecharge(
  serviceClient: NonNullable<ReturnType<typeof getSupabaseServiceRoleClient>>,
  input: {
    rechargeId: string | null;
    expiresAt: string | null;
    userId: string;
    userEmail: string | null;
    channel: PaymentChannel;
    amount: number;
    fee: number;
    payableAmount: number;
    clientRequestId: string;
    customerNote: string;
    rateSnapshot: {
      requestedCnyAmount: string;
      expectedUsdtAmount: string;
      marketRate: string;
      settlementRate: string;
      source: string;
      effectiveDate: string;
      effectiveAt: string;
    } | null;
  }
) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rechargeNo = generateRechargeNo();
    const row = {
      ...(input.rechargeId ? { id: input.rechargeId } : {}),
      recharge_no: rechargeNo,
      user_id: input.userId,
      user_email: input.userEmail,
      channel: input.channel.code,
      channel_code: input.channel.code,
      channel_name: input.channel.name,
      provider: input.channel.provider,
      currency: input.rateSnapshot ? "CNY" : input.channel.currency,
      network: input.channel.networkLabel ?? null,
      amount: input.rateSnapshot?.requestedCnyAmount ?? input.amount,
      requested_amount: input.rateSnapshot?.requestedCnyAmount ?? input.amount,
      fee_amount: input.rateSnapshot ? "0.00" : input.fee,
      payable_amount: input.rateSnapshot?.requestedCnyAmount ?? input.payableAmount,
      received_amount: 0,
      credited_amount: 0,
      status: input.channel.reviewMode === "manual" ? "waiting_payment" : "pending",
      client_request_id: input.clientRequestId,
      payment_method: input.channel.code,
      review_mode: input.channel.reviewMode ?? "provider",
      customer_note: input.customerNote || null,
      user_note: input.customerNote || null,
      ...(input.rateSnapshot ? {
        settlement_currency: "USDT",
        requested_cny_amount: input.rateSnapshot.requestedCnyAmount,
        expected_usdt_amount: input.rateSnapshot.expectedUsdtAmount,
        actual_received_usdt: null,
        credited_cny_amount: null,
        locked_market_rate: input.rateSnapshot.marketRate,
        locked_settlement_rate: input.rateSnapshot.settlementRate,
        rate_source: input.rateSnapshot.source,
        rate_effective_date: input.rateSnapshot.effectiveDate,
        rate_effective_at: input.rateSnapshot.effectiveAt,
        rate_locked_at: new Date().toISOString(),
        expires_at: input.expiresAt,
        payment_address: input.channel.manualPayment?.payment_address ?? null,
        payment_token_contract: input.channel.manualPayment?.token_contract ?? null,
      } : {}),
    };

    const insertResult = await serviceClient.from("account_recharges").insert(row);
    if (!insertResult.error) return rechargeNo;

    if (!input.rateSnapshot && isMissingClientRequestColumn(insertResult.error)) {
      const retryRow = { ...row };
      delete (retryRow as Partial<typeof row>).client_request_id;
      const retry = await serviceClient.from("account_recharges").insert(retryRow);
      if (!retry.error) return rechargeNo;
      lastError = retry.error;
    } else {
      lastError = insertResult.error;
    }

    if ((lastError as { code?: string }).code === "23505") {
      const existing = await findExistingRecharge(serviceClient, input.userId, input.clientRequestId);
      if (existing?.rechargeNo) return existing.rechargeNo;
      continue;
    }
    break;
  }
  throw lastError ?? new Error("Recharge creation failed");
}

async function requireUser() {
  if (!hasSupabaseServerConfig()) {
    return { ok: false as const, response: NextResponse.json({ error: "Recharge service is unavailable.", code: "RECHARGE_LIST_READ_FAILED" }, { status: 503 }) };
  }
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { ok: false as const, response: NextResponse.json({ error: "Please sign in before continuing.", code: "RECHARGE_AUTH_REQUIRED" }, { status: 401 }) };
  }
  return { ok: true as const, supabase, user: data.user };
}

function paymentFailure(
  error: unknown,
  operation: "list" | "channel" | "risk" | "create" | "service",
) {
  const requestId = randomUUID();
  const failure = buildRechargePublicFailure(operation, requestId);
  logRechargeFailure(operation, requestId, failure.status, error);
  return NextResponse.json(failure.body, { status: failure.status });
}

function logRechargeFailure(
  operation: string,
  requestId: string,
  status: number,
  error: unknown,
) {
  console.error(
    "[Recharge API]",
    JSON.stringify(buildRechargeSafeLogFields({
      operation,
      requestId,
      status,
      error,
    })),
  );
}

function generateRechargeNo() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RC${stamp}${random}`;
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeRequestId(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 120);
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getReservedFingerprintAmount(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = (value as Record<string, unknown>).expectedUsdtAmount;
  if (typeof raw === "string" && /^\d+\.\d{4}$/.test(raw)) return raw;
  return null;
}

function classifyExactRange(amount: string, minimum: number, maximum: number) {
  const minimumComparison = compareRechargeDecimals(amount, String(minimum));
  const maximumComparison = compareRechargeDecimals(amount, String(maximum));
  if (minimumComparison === null || maximumComparison === null) return "invalid";
  if (minimumComparison < 0) return "below_minimum";
  if (maximum > 0 && maximumComparison > 0) return "above_maximum";
  return "valid";
}

function isMissingClientRequestColumn(error: unknown) {
  const message = getPaymentErrorMessage(error, "");
  return /client_request_id|42703|schema cache/i.test(message);
}
