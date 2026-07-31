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
  "recharge_no,channel,channel_code,channel_name,currency,network,amount,requested_amount,fee_amount,payable_amount,received_amount,credited_amount,status,created_at,paid_at,completed_at,review_reason,error_summary";
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
    if (currency && currency !== channel.currency) return NextResponse.json({ error: "Recharge currency does not match payment channel." }, { status: 400 });

    const summary = calculateRechargeAmounts(channel, rawAmount);
    const amountRange = classifyPublicRechargeAmountRange(
      summary.amount,
      channel.minimumAmount,
      channel.maximumAmount,
    );
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
      orderAmount: summary.amount,
      currency: channel.currency,
      paymentChannel: channel.code,
      riskContext: {
        provider: channel.provider,
        payable_amount: summary.payableAmount,
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
    const serviceClient = getSupabaseServiceRoleClient();
    if (!serviceClient) {
      return paymentFailure(null, "service");
    }

    const rechargeNo = await insertRecharge(serviceClient, {
      userId: context.user.id,
      userEmail: context.user.email ?? null,
      channel,
      amount: summary.amount,
      fee: summary.fee,
      payableAmount: summary.payableAmount,
      clientRequestId,
      customerNote,
    });

    if (channel.reviewMode === "manual") {
      return NextResponse.json({ rechargeNo, status: "waiting_payment", amount: summary.amount, fee: summary.fee, payableAmount: summary.payableAmount, reviewMode: "manual" }, { status: 201 });
    }

    try {
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
    .select("recharge_no,status,amount,requested_amount,fee_amount,payable_amount")
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
    reused: true,
  };
}

async function insertRecharge(
  serviceClient: NonNullable<ReturnType<typeof getSupabaseServiceRoleClient>>,
  input: {
    userId: string;
    userEmail: string | null;
    channel: PaymentChannel;
    amount: number;
    fee: number;
    payableAmount: number;
    clientRequestId: string;
    customerNote: string;
  }
) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rechargeNo = generateRechargeNo();
    const row = {
      recharge_no: rechargeNo,
      user_id: input.userId,
      user_email: input.userEmail,
      channel: input.channel.code,
      channel_code: input.channel.code,
      channel_name: input.channel.name,
      provider: input.channel.provider,
      currency: input.channel.currency,
      network: input.channel.networkLabel ?? null,
      amount: input.amount,
      requested_amount: input.amount,
      fee_amount: input.fee,
      payable_amount: input.payableAmount,
      received_amount: 0,
      credited_amount: 0,
      status: input.channel.reviewMode === "manual" ? "waiting_payment" : "pending",
      client_request_id: input.clientRequestId,
      payment_method: input.channel.code,
      review_mode: input.channel.reviewMode ?? "provider",
      customer_note: input.customerNote || null,
      user_note: input.customerNote || null,
    };

    const insertResult = await serviceClient.from("account_recharges").insert(row);
    if (!insertResult.error) return rechargeNo;

    if (isMissingClientRequestColumn(insertResult.error)) {
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

function isMissingClientRequestColumn(error: unknown) {
  const message = getPaymentErrorMessage(error, "");
  return /client_request_id|42703|schema cache/i.test(message);
}
