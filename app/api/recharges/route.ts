import { NextResponse } from "next/server";

import { calculateRechargeAmounts } from "@/lib/payments/channels";
import type { PaymentChannel, RechargeStatus } from "@/lib/payments/channel-types";
import { getPaymentProvider } from "@/lib/payments/providers";
import {
  RECHARGE_STATUSES,
  getPaymentErrorMessage,
  isPaymentSchemaUnavailable,
  normalizeChannelRow,
  normalizeRechargeRow,
} from "@/lib/payments/recharge-utils";
import { evaluateRechargeRisk, riskResponseMessage, shouldBlockRisk } from "@/lib/risk/risk-service";
import { checkRateLimit, checkRequestSize, getUserRateLimitKey } from "@/lib/security/rate-limit";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { assertUserBusinessAllowed, isAccountRestrictionError } from "@/lib/users/account-guard";

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
    return paymentFailure(error, "Recharge records loading failed. Please try again later.", "RECHARGE_LIST_READ_FAILED");
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
    throw guardError;
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || Object.keys(body).some((key) => !allowedCreateKeys.has(key))) {
    return NextResponse.json({ error: "Invalid recharge request parameters." }, { status: 400 });
  }

  const channelValue = body.channel ?? body.payment_method;
  const channelCode = typeof channelValue === "string" ? channelValue.trim() : "";
  const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
  const customerNote = typeof body.customer_note === "string" ? body.customer_note.trim() : "";
  const rawAmount = typeof body.amount === "number" ? body.amount : Number(body.amount);
  const clientRequestId = normalizeRequestId(body.client_request_id ?? body.clientRequestId);
  if (!channelCode) return NextResponse.json({ error: "Please select a payment channel." }, { status: 400 });
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
    return NextResponse.json({ error: "Please enter a valid recharge amount." }, { status: 400 });
  }
  if (!clientRequestId) {
    return NextResponse.json({ error: "Missing valid recharge request id." }, { status: 400 });
  }
  if (customerNote.length > 500) return NextResponse.json({ error: "Recharge note cannot exceed 500 characters." }, { status: 400 });

  try {
    const existing = await findExistingRecharge(context.supabase, context.user.id, clientRequestId);
    if (existing) return NextResponse.json(existing, { status: 200 });

    const { data: channelData, error: channelError } = await context.supabase
      .from("payment_channels")
      .select("channel,code,enabled,configured,display_name,currency,network,min_amount,minimum_amount,fee_rate,provider,provider_name,public_config,sort_order")
      .or(`code.eq.${channelCode},channel.eq.${channelCode}`)
      .eq("enabled", true)
      .maybeSingle();
    if (channelError) throw channelError;
    const channel = channelData ? normalizeChannelRow(channelData as Record<string, unknown>) : null;
    if (!channel || !channel.enabled || !channel.configured) return NextResponse.json({ error: "Payment channel is not available." }, { status: 400 });
    if (currency && currency !== channel.currency) return NextResponse.json({ error: "Recharge currency does not match payment channel." }, { status: 400 });

    const summary = calculateRechargeAmounts(channel, rawAmount);
    if (summary.amount < channel.minimumAmount) {
      return NextResponse.json(
        { error: `Minimum recharge amount for this channel is ${channel.minimumAmount} ${channel.currency}.` },
        { status: 400 }
      );
    }
    if (channel.maximumAmount && summary.amount > channel.maximumAmount) {
      return NextResponse.json({ error: `Single recharge amount cannot exceed ${channel.maximumAmount} ${channel.currency}.` }, { status: 400 });
    }

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

    const rechargeNo = await insertRecharge(context.supabase, {
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
      await context.supabase.from("account_recharges").update({ status: "waiting_payment" }).eq("recharge_no", rechargeNo).eq("user_id", context.user.id);
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
      console.error("[Recharge provider]", getPaymentErrorMessage(providerError, "Provider is not configured"));
      return NextResponse.json(
        {
          error: "Payment channel is not configured. The recharge request is retained as pending payment.",
          rechargeNo,
          status: "pending",
          amount: summary.amount,
          fee: summary.fee,
          payableAmount: summary.payableAmount,
        },
        { status: 503 }
      );
    }
  } catch (error) {
    return paymentFailure(error, "Recharge creation failed. Please try again later.", "RECHARGE_CREATE_FAILED");
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
  return {
    rechargeNo: String(data.recharge_no ?? ""),
    status: String(data.status ?? "pending"),
    amount: finiteNumber(data.requested_amount ?? data.amount),
    fee: finiteNumber(data.fee_amount),
    payableAmount: finiteNumber(data.payable_amount),
    reused: true,
  };
}

async function insertRecharge(
  supabase: ReturnType<typeof getSupabaseServerClient>,
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
      status: "pending",
      client_request_id: input.clientRequestId,
      payment_method: input.channel.code,
      review_mode: input.channel.reviewMode ?? "provider",
      customer_note: input.customerNote || null,
      user_note: input.customerNote || null,
    };

    const insertResult = await supabase.from("account_recharges").insert(row);
    if (!insertResult.error) return rechargeNo;

    if (isMissingClientRequestColumn(insertResult.error)) {
      const retryRow = { ...row };
      delete (retryRow as Partial<typeof row>).client_request_id;
      const retry = await supabase.from("account_recharges").insert(retryRow);
      if (!retry.error) return rechargeNo;
      lastError = retry.error;
    } else {
      lastError = insertResult.error;
    }

    if ((lastError as { code?: string }).code === "23505") {
      const existing = await findExistingRecharge(supabase, input.userId, input.clientRequestId);
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

function paymentFailure(error: unknown, fallback: string, code: string) {
  console.error("[Recharge API]", getPaymentErrorMessage(error, fallback));
  return NextResponse.json(
    {
      error: isPaymentSchemaUnavailable(error)
        ? "Payment database is not initialized. Please apply the payment management migration."
        : getPaymentErrorMessage(error, fallback),
      code,
    },
    { status: isPaymentSchemaUnavailable(error) ? 503 : 500 }
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