import { NextResponse } from "next/server";

import type { PaymentChannelCode, PaymentProviderCode, ProviderCallbackContext, ProviderParsedCallback } from "@/lib/payments/channel-types";
import { getSafeErrorMessage } from "@/lib/payments/payment-errors";
import { getPaymentProvider } from "@/lib/payments/providers";
import { normalizeChannelRow } from "@/lib/payments/recharge-utils";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const service = getSupabaseServiceRoleClient();
  if (!service) {
    return NextResponse.json({ error: "服务端支付密钥未配置" }, { status: 503 });
  }

  const rawBody = await request.text();
  const url = new URL(request.url);
  const channelCode = String(url.searchParams.get("channel") ?? request.headers.get("x-payment-channel") ?? "").trim();
  const payload = safeJson(rawBody);

  if (!channelCode) {
    await writeCallbackLog(service, { channel: null, signatureResult: "failed", processResult: "processing_failed", payloadSummary: summarizePayload(payload), errorSummary: "缺少支付渠道" });
    return NextResponse.json({ error: "缺少支付渠道" }, { status: 400 });
  }

  try {
    const { data: channelRow, error: channelError } = await service
      .from("payment_channels")
      .select("channel,code,enabled,display_name,currency,network,min_amount,minimum_amount,fee_rate,provider,provider_name,sort_order,configured")
      .or(`code.eq.${channelCode},channel.eq.${channelCode}`)
      .maybeSingle();
    if (channelError) throw channelError;

    const channel = channelRow ? normalizeChannelRow(channelRow as Record<string, unknown>) : null;
    if (!channel) throw new Error("支付渠道不存在");

    const context: ProviderCallbackContext = {
      channelCode: channel.code as PaymentChannelCode,
      provider: channel.provider as PaymentProviderCode,
      rawBody,
      headers: request.headers,
    };
    const provider = getPaymentProvider(channel.provider);
    const verified = await provider.verifyCallback(rawBody, context);

    if (!verified) {
      await writeCallbackLog(service, { channel: channel.code, signatureResult: "failed", processResult: "signature_failed", payloadSummary: summarizePayload(payload), errorSummary: "回调验签失败或 Provider 未配置" });
      return NextResponse.json({ error: "回调验签失败" }, { status: 400 });
    }

    const parsed = (await provider.parseCallback(payload ?? rawBody, context)) as ProviderParsedCallback;
    const session = await findCallbackSession(service, parsed);
    if (!session) {
      await writeCallbackLog(service, { channel: channel.code, paymentNo: parsed.businessNo, signatureResult: "success", processResult: "order_not_found", providerTradeNo: parsed.providerTransactionId, payloadSummary: summarizeParsed(parsed), errorSummary: "未找到支付会话" });
      return NextResponse.json({ error: "支付会话不存在" }, { status: 404 });
    }

    const amountOk = Number(session.payable_amount).toFixed(6) === Number(parsed.amount).toFixed(6);
    const currencyOk = String(session.currency).toUpperCase() === String(parsed.currency).toUpperCase();
    if (!amountOk || !currencyOk) {
      await writeCallbackLog(service, { channel: channel.code, paymentNo: parsed.businessNo, signatureResult: "success", processResult: "amount_mismatch", providerTradeNo: parsed.providerTransactionId, payloadSummary: summarizeParsed(parsed), errorSummary: "金额或币种不一致" });
      return NextResponse.json({ error: "金额或币种不一致" }, { status: 400 });
    }

    if (parsed.status !== "paid") {
      await service
        .from("payment_sessions")
        .update({ status: parsed.status, last_synced_at: new Date().toISOString(), provider_transaction_id: parsed.providerTransactionId })
        .eq("id", session.id)
        .neq("status", "paid");
      await writeCallbackLog(service, { channel: channel.code, paymentNo: parsed.businessNo, signatureResult: "success", processResult: "success", providerTradeNo: parsed.providerTransactionId, payloadSummary: summarizeParsed(parsed) });
      return NextResponse.json({ ok: true });
    }

    if (session.status === "paid") {
      await writeCallbackLog(service, { channel: channel.code, paymentNo: parsed.businessNo, signatureResult: "success", processResult: "duplicate", providerTradeNo: parsed.providerTransactionId, isDuplicate: true, payloadSummary: summarizeParsed(parsed) });
      return NextResponse.json({ ok: true, duplicate: true });
    }

    if (session.business_type === "recharge" || session.business_type === "account_recharge") {
      const { error: rpcError } = await service.rpc("complete_account_recharge", {
        p_recharge_id: session.business_id,
        p_provider_transaction_id: parsed.providerTransactionId,
        p_paid_amount: parsed.amount,
        p_currency: parsed.currency,
      });
      if (rpcError) throw rpcError;
    } else {
      throw new Error("订单支付成功自动联动尚未启用，请保留人工确认流程。");
    }

    await service
      .from("payment_sessions")
      .update({
        status: "paid",
        provider_transaction_id: parsed.providerTransactionId,
        paid_at: parsed.paidAt ?? new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        reconcile_status: "matched",
      })
      .eq("id", session.id)
      .neq("status", "paid");

    await writeCallbackLog(service, { channel: channel.code, paymentNo: parsed.businessNo, signatureResult: "success", processResult: "success", providerTradeNo: parsed.providerTransactionId, payloadSummary: summarizeParsed(parsed) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = getSafeErrorMessage(error, "支付回调处理失败");
    await writeCallbackLog(service, { channel: channelCode, signatureResult: "success", processResult: "processing_failed", payloadSummary: summarizePayload(payload), errorSummary: message });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function findCallbackSession(service: NonNullable<ReturnType<typeof getSupabaseServiceRoleClient>>, parsed: ProviderParsedCallback) {
  let query = service
    .from("payment_sessions")
    .select("id,business_type,business_id,business_no,status,payable_amount,currency")
    .limit(1);

  if (parsed.sessionNo) query = query.eq("session_no", parsed.sessionNo);
  else if (parsed.providerOrderNo) query = query.eq("provider_order_no", parsed.providerOrderNo);
  else query = query.eq("business_no", parsed.businessNo);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

async function writeCallbackLog(
  service: NonNullable<ReturnType<typeof getSupabaseServiceRoleClient>>,
  input: {
    channel: string | null;
    paymentNo?: string | null;
    providerTradeNo?: string | null;
    signatureResult: "success" | "failed";
    processResult: "success" | "signature_failed" | "amount_mismatch" | "order_not_found" | "duplicate" | "processing_failed";
    isDuplicate?: boolean;
    payloadSummary: Record<string, unknown>;
    errorSummary?: string | null;
  }
) {
  await service.from("payment_callback_logs").insert({
    channel: input.channel,
    payment_no: input.paymentNo ?? null,
    provider_trade_no: input.providerTradeNo ?? null,
    signature_result: input.signatureResult,
    process_result: input.processResult,
    http_status: input.processResult === "success" || input.processResult === "duplicate" ? 200 : 400,
    is_duplicate: input.isDuplicate ?? false,
    payload_summary: input.payloadSummary,
    error_summary: input.errorSummary ?? null,
  });
}

function safeJson(rawBody: string) {
  try {
    return rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return null;
  }
}

function summarizePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return { type: typeof payload };
  const source = payload as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => !/key|secret|sign|token|password|private/i.test(key))
      .slice(0, 20)
  );
}

function summarizeParsed(parsed: ProviderParsedCallback): Record<string, unknown> {
  return {
    businessNo: parsed.businessNo,
    sessionNo: parsed.sessionNo ?? null,
    providerOrderNo: parsed.providerOrderNo ?? null,
    providerTransactionIdPresent: Boolean(parsed.providerTransactionId),
    status: parsed.status,
    amount: parsed.amount,
    currency: parsed.currency,
  };
}
