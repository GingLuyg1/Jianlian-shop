import { NextResponse } from "next/server";

import { calculateRechargeAmounts, getPaymentChannel } from "@/lib/payments/channels";
import { getPaymentProvider, getPaymentProviderErrorMessage } from "@/lib/payments/providers";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

function isRechargeSchemaMissing(message: string) {
  return /recharge_records|schema cache|PGRST205|42P01|Could not find the table/i.test(message);
}

function generateRechargeNo() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RC${stamp}${random}`;
}

export async function POST(request: Request) {
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json({ error: "Supabase 环境变量未配置" }, { status: 500 });
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "请先登录后再充值" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { channel?: unknown; amount?: unknown }
    | null;
  const channelCode = typeof body?.channel === "string" ? body.channel.trim() : "";
  const rawAmount = typeof body?.amount === "number" ? body.amount : Number(body?.amount);
  const channel = getPaymentChannel(channelCode);

  if (!channel) {
    return NextResponse.json({ error: "支付渠道不存在" }, { status: 400 });
  }

  if (!channel.enabled || channel.status !== "active") {
    return NextResponse.json({ error: "支付渠道暂未开放" }, { status: 400 });
  }

  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
    return NextResponse.json({ error: "请输入有效充值金额" }, { status: 400 });
  }

  const summary = calculateRechargeAmounts(channel, rawAmount);
  if (summary.amount < channel.minimumAmount) {
    return NextResponse.json(
      { error: `当前渠道最低充值金额为 ${channel.minimumAmount} ${channel.currency}` },
      { status: 400 }
    );
  }

  if (!channel.configured) {
    return NextResponse.json(
      {
        error: "支付渠道暂未配置",
        status: "pending",
        amount: summary.amount,
        fee: summary.fee,
        payableAmount: summary.payableAmount,
      },
      { status: 503 }
    );
  }

  const provider = getPaymentProvider(channel.provider);
  const rechargeNo = generateRechargeNo();

  try {
    const insertPayload = {
      recharge_no: rechargeNo,
      user_id: user.id,
      channel_code: channel.code,
      channel_name: channel.name,
      provider: channel.provider,
      currency: channel.currency,
      network: channel.network ?? null,
      amount: summary.amount,
      fee_amount: summary.fee,
      payable_amount: summary.payableAmount,
      arrival_amount: summary.arrivalAmount,
      status: "pending",
    };

    const { error: insertError } = await supabase.from("recharge_records").insert(insertPayload);
    if (insertError) throw insertError;

    const payment = await provider.createPayment({
      rechargeNo,
      channel,
      userId: user.id,
      amount: summary.amount,
      fee: summary.fee,
      payableAmount: summary.payableAmount,
    });

    return NextResponse.json(payment);
  } catch (error) {
    const message = getPaymentProviderErrorMessage(error, "充值下单失败，请稍后重试");
    const schemaMissing = isRechargeSchemaMissing(message);
    const providerUnconfigured = /支付渠道暂未配置/i.test(message);
    return NextResponse.json(
      {
        error: schemaMissing
          ? "充值记录表尚未初始化，请先执行 recharge_records migration。"
          : providerUnconfigured
            ? "支付渠道暂未配置"
            : message,
        rechargeNo,
        status: "pending",
        amount: summary.amount,
        fee: summary.fee,
        payableAmount: summary.payableAmount,
      },
      { status: schemaMissing ? 503 : providerUnconfigured ? 503 : 400 }
    );
  }
}
