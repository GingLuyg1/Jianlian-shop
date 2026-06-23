import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  PaymentChannelCode,
  PaymentProviderCode,
  ProviderCallbackContext,
  ProviderParsedCallback,
} from "@/lib/payments/channel-types";
import { completePayment } from "@/lib/payments/complete-payment-service";
import { getSafeErrorMessage } from "@/lib/payments/payment-errors";
import {
  getPaymentProvider,
  isPaymentChannelCode,
  normalizeProviderPaymentStatus,
} from "@/lib/payments/providers";
import { normalizeChannelRow } from "@/lib/payments/recharge-utils";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const UNIFIED_CALLBACK_IMPLEMENTED = true;

type CallbackStatus =
  | "received"
  | "verified"
  | "signature_failed"
  | "parsed"
  | "amount_mismatch"
  | "currency_mismatch"
  | "duplicate"
  | "business_not_found"
  | "processing_failed"
  | "success";

export async function handlePaymentCallback(request: Request, routeChannel?: string) {
  const service = getSupabaseServiceRoleClient();
  if (!service) return response({ error: "服务端支付密钥未配置" }, 503);

  const rawBody = await request.text();
  const url = new URL(request.url);
  const channelCode = String(
    routeChannel ?? url.searchParams.get("channel") ?? request.headers.get("x-payment-channel") ?? ""
  ).trim();
  const payload = safeJson(rawBody);
  let logId: string | null = null;

  try {
    if (!isPaymentChannelCode(channelCode)) {
      logId = await createCallbackLog(service, {
        channel: channelCode || null,
        status: "received",
        payloadSummary: summarizePayload(payload),
      });
      await updateCallbackLog(service, logId, "processing_failed", "支付渠道不在允许列表");
      return response({ error: "支付渠道不支持" }, 400);
    }

    logId = await createCallbackLog(service, {
      channel: channelCode,
      status: "received",
      payloadSummary: summarizePayload(payload),
    });

    const channel = await loadChannel(service, channelCode);
    const context: ProviderCallbackContext = {
      channelCode,
      provider: channel.provider as PaymentProviderCode,
      rawBody,
      headers: request.headers,
    };
    const provider = getPaymentProvider(channel.provider);
    const verified = await provider.verifyCallback(rawBody, context);
    if (!verified) {
      await updateCallbackLog(service, logId, "signature_failed", "回调验签失败或 Provider 未配置", {
        signature_result: "failed",
      });
      return response({ error: "回调验签失败" }, 400);
    }
    await updateCallbackLog(service, logId, "verified", null, { signature_result: "success" });

    const parsedRaw = (await provider.parseCallback(payload ?? rawBody, context)) as ProviderParsedCallback;
    const parsed = { ...parsedRaw, status: normalizeProviderPaymentStatus(parsedRaw.status) };
    await updateCallbackLog(service, logId, "parsed", null, {
      payment_no: parsed.businessNo,
      provider_trade_no: parsed.providerTransactionId || null,
      payload_summary: summarizeParsed(parsed),
    });

    const session = await findCallbackSession(service, parsed, channelCode);
    if (!session) {
      await updateCallbackLog(service, logId, "business_not_found", "未找到匹配的支付会话");
      return response({ error: "支付会话不存在" }, 404);
    }

    if (!amountEqual(session.payable_amount, parsed.amount, session.currency)) {
      await updateCallbackLog(service, logId, "amount_mismatch", "渠道金额与支付会话金额不一致");
      return response({ error: "支付金额不一致" }, 400);
    }
    if (String(session.currency).toUpperCase() !== String(parsed.currency).toUpperCase()) {
      await updateCallbackLog(service, logId, "currency_mismatch", "渠道币种与支付会话币种不一致");
      return response({ error: "支付币种不一致" }, 400);
    }

    if (parsed.status !== "paid") {
      await service
        .from("payment_sessions")
        .update({
          status: parsed.status,
          provider_transaction_id: parsed.providerTransactionId || null,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", session.id)
        .neq("status", "paid");
      await updateCallbackLog(service, logId, "success", null);
      return response({ ok: true });
    }

    if (session.status === "paid") {
      await updateCallbackLog(service, logId, "duplicate", null, { is_duplicate: true });
      return response({ ok: true, duplicate: true });
    }

    const completion = await completePayment(
      {
        paymentSessionId: session.id,
        providerTransactionId: parsed.providerTransactionId,
        amount: parsed.amount,
        currency: parsed.currency,
        paidAt: parsed.paidAt,
        source: "callback",
      },
      service
    );
    await updateCallbackLog(service, logId, completion.idempotent ? "duplicate" : "success", completion.deliveryError ?? null, {
      is_duplicate: completion.idempotent,
      business_type: completion.businessType,
      business_id: completion.businessId,
    });
    return response({ ok: true, duplicate: completion.idempotent });
  } catch (error) {
    const message = getSafeErrorMessage(error, "支付回调处理失败");
    if (logId) await updateCallbackLog(service, logId, "processing_failed", message);
    return response({ error: message }, 400);
  }
}

async function loadChannel(service: SupabaseClient, channelCode: PaymentChannelCode) {
  const { data, error } = await service
    .from("payment_channels")
    .select("channel,code,enabled,display_name,currency,network,min_amount,minimum_amount,fee_rate,provider,provider_name,sort_order,configured")
    .or(`code.eq.${channelCode},channel.eq.${channelCode}`)
    .maybeSingle();
  if (error) throw error;
  const channel = data ? normalizeChannelRow(data as Record<string, unknown>) : null;
  if (!channel) throw new Error("支付渠道不存在");
  return channel;
}

async function findCallbackSession(
  service: SupabaseClient,
  parsed: ProviderParsedCallback,
  channelCode: PaymentChannelCode
) {
  let query = service
    .from("payment_sessions")
    .select("id,business_type,business_id,business_no,status,payable_amount,currency,channel_code")
    .eq("channel_code", channelCode)
    .limit(1);
  if (parsed.sessionNo) query = query.eq("session_no", parsed.sessionNo);
  else if (parsed.providerOrderNo) query = query.eq("provider_order_no", parsed.providerOrderNo);
  else query = query.eq("business_no", parsed.businessNo);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

async function createCallbackLog(
  service: SupabaseClient,
  input: { channel: string | null; status: CallbackStatus; payloadSummary: Record<string, unknown> }
) {
  const { data, error } = await service
    .from("payment_callback_logs")
    .insert({
      channel: input.channel,
      signature_result: "pending",
      process_result: input.status,
      http_status: 202,
      payload_summary: input.payloadSummary,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[Payment callback] log insert failed", getSafeErrorMessage(error, "callback log error"));
    return null;
  }
  return String(data.id);
}

async function updateCallbackLog(
  service: SupabaseClient,
  logId: string | null,
  status: CallbackStatus,
  errorSummary: string | null,
  extra: Record<string, unknown> = {}
) {
  if (!logId) return;
  const { error } = await service
    .from("payment_callback_logs")
    .update({
      process_result: status,
      http_status: ["success", "duplicate"].includes(status) ? 200 : ["received", "verified", "parsed"].includes(status) ? 202 : 400,
      error_summary: errorSummary,
      ...extra,
    })
    .eq("id", logId);
  if (error) console.error("[Payment callback] log update failed", getSafeErrorMessage(error, "callback log error"));
}

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function amountEqual(local: unknown, provider: unknown, currency: unknown) {
  const scale = String(currency).toUpperCase() === "USDT" ? 6 : 2;
  return Number(local).toFixed(scale) === Number(provider).toFixed(scale);
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
  return Object.fromEntries(
    Object.entries(payload as Record<string, unknown>)
      .filter(([key]) => !/key|secret|sign|token|password|private|credential/i.test(key))
      .slice(0, 20)
      .map(([key, value]) => [key, summarizeValue(value)])
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

function summarizeValue(value: unknown) {
  if (typeof value === "string") return value.length > 120 ? `${value.slice(0, 120)}...` : value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return "[已脱敏]";
}
