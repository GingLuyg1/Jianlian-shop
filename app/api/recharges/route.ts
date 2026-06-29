import { NextResponse } from "next/server";

import { calculateRechargeAmounts } from "@/lib/payments/channels";
import type { PaymentChannel } from "@/lib/payments/channel-types";
import { getPaymentProvider } from "@/lib/payments/providers";
import {
  RECHARGE_STATUSES,
  getPaymentErrorMessage,
  isPaymentSchemaUnavailable,
  normalizeChannelRow,
  normalizeRechargeRow,
} from "@/lib/payments/recharge-utils";
import type { RechargeStatus } from "@/lib/payments/channel-types";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { assertUserBusinessAllowed, isAccountRestrictionError } from "@/lib/users/account-guard";

export const dynamic = "force-dynamic";

const rechargeSelect =
  "recharge_no,channel,channel_code,channel_name,currency,network,amount,requested_amount,fee_amount,payable_amount,received_amount,credited_amount,status,created_at,paid_at";
const allowedCreateKeys = new Set(["channel", "amount", "client_request_id", "clientRequestId"]);

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
    return paymentFailure(error, "充值记录加载失败，请稍后重试");
  }
}

export async function POST(request: Request) {
  const context = await requireUser();
  if (!context.ok) return context.response;

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
    return NextResponse.json({ error: "充值请求参数不正确" }, { status: 400 });
  }

  const channelCode = typeof body.channel === "string" ? body.channel.trim() : "";
  const rawAmount = typeof body.amount === "number" ? body.amount : Number(body.amount);
  const clientRequestId = normalizeRequestId(body.client_request_id ?? body.clientRequestId);
  if (!channelCode) return NextResponse.json({ error: "请选择支付渠道" }, { status: 400 });
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
    return NextResponse.json({ error: "请输入有效充值金额" }, { status: 400 });
  }
  if (!clientRequestId) {
    return NextResponse.json({ error: "缺少有效的充值请求编号" }, { status: 400 });
  }

  try {
    const existing = await findExistingRecharge(context.supabase, context.user.id, clientRequestId);
    if (existing) return NextResponse.json(existing, { status: 200 });

    const { data: channelData, error: channelError } = await context.supabase
      .from("payment_channels")
      .select("channel,code,enabled,display_name,currency,network,min_amount,minimum_amount,fee_rate,provider,provider_name,sort_order")
      .or(`code.eq.${channelCode},channel.eq.${channelCode}`)
      .eq("enabled", true)
      .maybeSingle();
    if (channelError) throw channelError;
    const channel = channelData ? normalizeChannelRow(channelData as Record<string, unknown>) : null;
    if (!channel || !channel.enabled) return NextResponse.json({ error: "支付渠道暂未开放" }, { status: 400 });

    const summary = calculateRechargeAmounts(channel, rawAmount);
    if (summary.amount < channel.minimumAmount) {
      return NextResponse.json(
        { error: `当前渠道最低充值金额为 ${channel.minimumAmount} ${channel.currency}` },
        { status: 400 }
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
    });

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
      console.error("[Recharge provider]", getPaymentErrorMessage(providerError, "Provider 未配置"));
      return NextResponse.json(
        {
          error: "渠道尚未配置，充值单已保留为待支付状态。",
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
    return paymentFailure(error, "充值单创建失败，请稍后重试");
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
    .in("status", ["pending", "processing"])
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
  throw lastError ?? new Error("充值单创建失败");
}

async function requireUser() {
  if (!hasSupabaseServerConfig()) {
    return { ok: false as const, response: NextResponse.json({ error: "Supabase 环境变量未配置" }, { status: 503 }) };
  }
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { ok: false as const, response: NextResponse.json({ error: "请先登录后再操作" }, { status: 401 }) };
  }
  return { ok: true as const, supabase, user: data.user };
}

function paymentFailure(error: unknown, fallback: string) {
  console.error("[Recharge API]", getPaymentErrorMessage(error, fallback));
  return NextResponse.json(
    {
      error: isPaymentSchemaUnavailable(error)
        ? "支付数据库尚未初始化，请先执行支付管理 migration。"
        : getPaymentErrorMessage(error, fallback),
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

