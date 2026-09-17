import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  PaymentChannelCode,
  PaymentProvider,
  PaymentProviderCode,
  ProviderCallbackContext,
  ProviderParsedCallback,
} from "@/lib/payments/channel-types";
import { callbackSessionIdentityMatches, callbackSessionNoCandidate } from "@/lib/payments/callback-session-bootstrap.mjs";
import {
  callbackObservationRecord,
  createCallbackObservation,
  type CallbackObservation,
} from "@/lib/payments/callback-observability.mjs";
import { completePayment } from "@/lib/payments/complete-payment-service";
import { getSafeErrorMessage } from "@/lib/payments/payment-errors";
import { assertPaymentStatusTransition } from "@/lib/payments/payment-status-machine";
import {
  isPaymentChannelCode,
  normalizeProviderPaymentStatus,
  resolveProviderForExistingSession,
} from "@/lib/payments/providers";
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
  const url = new URL(request.url);
  const requestedChannel = String(
    routeChannel ?? url.searchParams.get("channel") ?? request.headers.get("x-payment-channel") ?? ""
  ).trim();
  const channelCode = requestedChannel === "wechat_pay" ? "wechat" : requestedChannel;
  const observation = createCallbackObservation({ headers: request.headers, channel: channelCode });
  const service = getSupabaseServiceRoleClient();
  if (!service) return observedResponse(response({ error: "服务端支付密钥未配置" }, 503), observation, {
    processResult: "processing_failed",
    httpStatus: 503,
  });

  const rawBody = await request.text();
  const payload = request.method === "GET" ? Object.fromEntries(url.searchParams.entries()) : safeJson(rawBody);
  let logId: string | null = null;
  let callbackProvider: PaymentProvider | null = null;

  try {
    if (!isPaymentChannelCode(channelCode)) {
      logId = await createCallbackLog(service, {
        channel: channelCode || null,
        status: "received",
        payloadSummary: callbackPayloadSummary(observation, summarizePayload(payload)),
      });
      await updateCallbackLog(service, logId, "processing_failed", "支付渠道不在允许列表");
      return observedResponse(response({ error: "支付渠道不支持" }, 400), observation, {
        processResult: "processing_failed",
        httpStatus: 400,
      });
    }

    logId = await createCallbackLog(service, {
      channel: channelCode,
      status: "received",
      payloadSummary: callbackPayloadSummary(observation, summarizePayload(payload)),
    });

    const sessionNoCandidate = callbackSessionNoCandidate(payload);
    if (!sessionNoCandidate) {
      await updateCallbackLog(service, logId, "business_not_found", "SESSION_ID_MISSING");
      return observedResponse(response({ error: "支付会话编号缺失" }, 400), observation, { processResult: "business_not_found", httpStatus: 400 });
    }
    observation.sessionNo = sessionNoCandidate;
    const session = await findCallbackSession(service, sessionNoCandidate);
    if (!session) {
      await updateCallbackLog(service, logId, "business_not_found", "SESSION_NOT_FOUND");
      return observedResponse(response({ error: "支付会话不存在" }, 404), observation, { processResult: "business_not_found", httpStatus: 404 });
    }
    if (session.channel_code !== channelCode) {
      await updateCallbackLog(service, logId, "processing_failed", "SESSION_CHANNEL_MISMATCH");
      return observedResponse(response({ error: "支付渠道不匹配" }, 400), observation, { processResult: "processing_failed", httpStatus: 400 });
    }
    const context: ProviderCallbackContext = {
      channelCode,
      provider: session.provider as PaymentProviderCode,
      rawBody,
      headers: request.headers,
      requestUrl: request.url,
    };
    observation.provider = String(session.provider);
    callbackProvider = resolveProviderForExistingSession(session);
    const verified = await callbackProvider.verifyCallback(rawBody, context);
    if (!verified) {
      await updateCallbackLog(service, logId, "signature_failed", "回调验签失败或 Provider 未配置", {
        signature_result: "failed",
      });
      return observedResponse(providerResponse(callbackProvider, { ok: false, message: "回调验签失败" }, { error: "回调验签失败" }, 400), observation, {
        signatureResult: "failed",
        processResult: "signature_failed",
        httpStatus: 400,
      });
    }
    observation.signatureResult = "success";
    await updateCallbackLog(service, logId, "verified", null, { signature_result: "success" });

    const parsedRaw = (await callbackProvider.parseCallback(payload ?? rawBody, context)) as ProviderParsedCallback;
    const parsed = { ...parsedRaw, status: normalizeProviderPaymentStatus(parsedRaw.status) };
    observation.sessionNo = parsed.sessionNo ?? null;
    await updateCallbackLog(service, logId, "parsed", null, {
      payment_no: parsed.businessNo,
      provider_trade_no: parsed.providerTransactionId || null,
      payload_summary: callbackPayloadSummary(observation, summarizeParsed(parsed)),
    });

    if (!callbackSessionIdentityMatches({ session, parsed, channelCode })) {
      await updateCallbackLog(service, logId, "processing_failed", "SESSION_IDENTITY_MISMATCH");
      return observedResponse(providerResponse(callbackProvider, { ok: false, message: "支付会话身份不匹配" }, { error: "支付会话身份不匹配" }, 400), observation, { processResult: "processing_failed", httpStatus: 400 });
    }

    const expiredRechargePayment = parsed.status === "paid"
      && String(session.business_type) === "recharge"
      && await isExpiredRechargePayment(service, session);
    const latePaymentMessage = "支付渠道在充值订单过期后确认付款，禁止自动入账，等待人工客服核对";
    if (expiredRechargePayment) {
      await preserveLateRechargePaymentEvidence(service, session, parsed, latePaymentMessage);
    }

    if (!amountEqual(session.payable_amount, parsed.amount, session.currency)) {
      await updateCallbackLog(service, logId, "amount_mismatch", "渠道金额与支付会话金额不一致");
      await recordCallbackReconciliationIssue(service, {
        session,
        parsed,
        result: "manual_review",
        differenceType: "amount_mismatch",
        errorCode: "CALLBACK_AMOUNT_MISMATCH",
        errorMessage: "支付回调金额与支付会话金额不一致",
      });
      return observedResponse(providerResponse(callbackProvider, { ok: false, message: "支付金额不一致" }, { error: "支付金额不一致" }, 400), observation, { processResult: "amount_mismatch", httpStatus: 400 });
    }
    if (String(session.currency).toUpperCase() !== String(parsed.currency).toUpperCase()) {
      await updateCallbackLog(service, logId, "currency_mismatch", "渠道币种与支付会话币种不一致");
      await recordCallbackReconciliationIssue(service, {
        session,
        parsed,
        result: "manual_review",
        differenceType: "currency_mismatch",
        errorCode: "CALLBACK_CURRENCY_MISMATCH",
        errorMessage: "支付回调币种与支付会话币种不一致",
      });
      return observedResponse(providerResponse(callbackProvider, { ok: false, message: "支付币种不一致" }, { error: "支付币种不一致" }, 400), observation, { processResult: "currency_mismatch", httpStatus: 400 });
    }

    if (parsed.status !== "paid") {
      const transition = assertPaymentStatusTransition(session.status, parsed.status);
      if (!transition.ok) {
        await updateCallbackLog(service, logId, "processing_failed", transition.message);
        await recordCallbackReconciliationIssue(service, {
          session,
          parsed,
          result: "manual_review",
          differenceType: "status_mismatch",
          errorCode: "CALLBACK_STATUS_TRANSITION_DENIED",
          errorMessage: transition.message,
        });
        return observedResponse(providerResponse(callbackProvider, { ok: false, message: transition.message }, { error: transition.message }, 409), observation, { processResult: "processing_failed", httpStatus: 409 });
      }
      await service
        .from("payment_sessions")
        .update({
          status: transition.storageStatus,
          provider_transaction_id: parsed.providerTransactionId || null,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", session.id)
        .neq("status", "paid");
      await updateCallbackLog(service, logId, "success", null);
      return observedResponse(providerResponse(callbackProvider, { ok: true }, { ok: true }), observation, { processResult: "success", httpStatus: 200 });
    }

    if (session.status === "paid") {
      await updateCallbackLog(service, logId, "duplicate", null, { is_duplicate: true });
      return observedResponse(providerResponse(callbackProvider, { ok: true, duplicate: true }, { ok: true, duplicate: true }), observation, { processResult: "duplicate", httpStatus: 200 });
    }

    if (expiredRechargePayment) {
      await recordCallbackReconciliationIssue(service, {
        session: { ...session, status: "expired" },
        parsed,
        result: "manual_review",
        differenceType: "provider_paid_local_unpaid",
        errorCode: "CALLBACK_RECHARGE_PAID_AFTER_EXPIRY",
        errorMessage: latePaymentMessage,
      });
      await updateCallbackLog(service, logId, "processing_failed", latePaymentMessage);
      return observedResponse(providerResponse(callbackProvider, { ok: true, message: latePaymentMessage }, { ok: true, manualReview: true }), observation, { processResult: "processing_failed", httpStatus: 200 });
    }

    const transition = assertPaymentStatusTransition(session.status, "paid");
    if (!transition.ok) {
      await updateCallbackLog(service, logId, "processing_failed", transition.message);
      await recordCallbackReconciliationIssue(service, {
        session,
        parsed,
        result: "manual_review",
        differenceType: "provider_paid_local_unpaid",
        errorCode: "CALLBACK_PAID_TRANSITION_DENIED",
        errorMessage: transition.message,
      });
      return observedResponse(providerResponse(callbackProvider, { ok: false, message: transition.message }, { error: transition.message }, 409), observation, { processResult: "processing_failed", httpStatus: 409 });
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
    return observedResponse(providerResponse(callbackProvider, { ok: true, duplicate: completion.idempotent }, { ok: true, duplicate: completion.idempotent }), observation, {
      processResult: completion.idempotent ? "duplicate" : "success",
      httpStatus: 200,
    });
  } catch (error) {
    const message = getSafeErrorMessage(error, "支付回调处理失败");
    if (logId) await updateCallbackLog(service, logId, "processing_failed", message);
    return observedResponse(providerResponse(callbackProvider, { ok: false, message }, { error: message }, 400), observation, { processResult: "processing_failed", httpStatus: 400 });
  }
}

function callbackPayloadSummary(observation: CallbackObservation, summary: Record<string, unknown>) {
  return {
    requestId: observation.requestId,
    receivedAt: observation.receivedAt,
    provider: observation.provider,
    channel: observation.channel,
    sessionNo: observation.sessionNo,
    ...summary,
  };
}

function observedResponse(
  callbackResponse: Response,
  observation: CallbackObservation,
  update: Partial<CallbackObservation>,
) {
  const record = callbackObservationRecord(observation, update);
  callbackResponse.headers.set("x-request-id", record.requestId);
  console.info("[Payment callback]", record);
  return callbackResponse;
}

async function findCallbackSession(
  service: SupabaseClient,
  sessionNo: string,
) {
  const { data, error } = await service
    .from("payment_sessions")
    .select("id,session_no,business_type,business_id,business_no,status,payable_amount,currency,channel_code,provider,provider_transaction_id,expires_at")
    .eq("session_no", sessionNo)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function isExpiredRechargePayment(service: SupabaseClient, session: Record<string, unknown>) {
  if (String(session.status) === "expired" || isPastDue(session.expires_at)) return true;
  const { data, error } = await service
    .from("account_recharges")
    .select("status,expires_at")
    .eq("id", String(session.business_id ?? ""))
    .maybeSingle();
  if (error) throw error;
  return data?.status === "expired" || isPastDue(data?.expires_at);
}

async function preserveLateRechargePaymentEvidence(
  service: SupabaseClient,
  session: Record<string, unknown>,
  parsed: ProviderParsedCallback,
  message: string,
) {
  const providerTransactionId = parsed.providerTransactionId || null;
  const checkedAt = new Date().toISOString();
  const { error: sessionError } = await service
    .from("payment_sessions")
    .update({
      status: "expired",
      provider_transaction_id: providerTransactionId,
      last_synced_at: checkedAt,
      reconcile_status: "provider_paid_local_unpaid",
      last_error: message,
    })
    .eq("id", String(session.id ?? ""))
    .in("status", ["pending", "processing", "failed", "expired", "closed"]);
  if (sessionError) {
    throw new Error(getSafeErrorMessage(sessionError, "late payment session evidence could not be saved"));
  }

  const { error: rechargeError } = await service
    .from("account_recharges")
    .update({
      status: "expired",
      provider_trade_no: providerTransactionId,
      callback_status: "manual_review",
      exception_type: "provider_paid_local_unpaid",
      error_summary: message,
    })
    .eq("id", String(session.business_id ?? ""))
    .in("status", ["pending", "waiting_payment", "processing", "failed", "expired", "closed"]);
  if (rechargeError) {
    throw new Error(getSafeErrorMessage(rechargeError, "late recharge evidence could not be saved"));
  }
}

function isPastDue(value: unknown) {
  const expiresAt = Date.parse(String(value ?? ""));
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
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

async function recordCallbackReconciliationIssue(
  service: SupabaseClient,
  input: {
    session: Record<string, unknown>;
    parsed: ProviderParsedCallback;
    result: "mismatched" | "manual_review" | "query_failed";
    differenceType:
      | "provider_paid_local_unpaid"
      | "local_paid_provider_unpaid"
      | "amount_mismatch"
      | "currency_mismatch"
      | "transaction_id_conflict"
      | "status_mismatch"
      | "provider_not_found";
    errorCode: string;
    errorMessage: string;
  }
) {
  const sessionId = String(input.session.id ?? "");
  if (!sessionId) return;

  const checkedAt = new Date().toISOString();
  const providerTransactionId = input.parsed.providerTransactionId || null;
  const dedupeKey = [
    "callback",
    sessionId,
    input.differenceType,
    providerTransactionId ?? "no-provider-transaction",
    input.parsed.amount,
    input.parsed.currency,
  ].join(":");

  const { error } = await service.from("payment_reconciliations").upsert(
    {
      reconciliation_no: `RCB${Date.now()}${Math.floor(Math.random() * 1000)}`,
      payment_session_id: sessionId,
      business_type: input.session.business_type,
      business_id: String(input.session.business_id ?? input.session.business_no ?? ""),
      channel_code: input.session.channel_code,
      provider: input.session.provider,
      local_status: input.session.status,
      provider_status: input.parsed.status,
      local_amount: input.session.payable_amount,
      provider_amount: input.parsed.amount,
      currency: input.session.currency,
      result: input.result,
      difference_type: input.differenceType,
      risk_level: "high",
      local_trade_no: input.session.provider_transaction_id ?? null,
      provider_trade_no: providerTransactionId,
      error_code: input.errorCode,
      error_message: input.errorMessage,
      provider_summary: summarizeParsed(input.parsed),
      checked_at: checkedAt,
      dedupe_key: dedupeKey,
      updated_at: checkedAt,
    },
    { onConflict: "dedupe_key" }
  );

  if (error) {
    console.error("[Payment callback] reconciliation issue record failed", getSafeErrorMessage(error, "reconciliation log error"));
  }
}

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function providerResponse(
  provider: PaymentProvider | null,
  result: { ok: boolean; duplicate?: boolean; message?: string },
  fallbackBody: Record<string, unknown>,
  fallbackStatus = 200
) {
  const formatted = provider?.formatCallbackResponse?.(result);
  if (formatted instanceof Response) return formatted;
  if (typeof formatted === "string") {
    return new Response(formatted, {
      status: fallbackStatus,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return response(fallbackBody, fallbackStatus);
}

function amountEqual(local: unknown, provider: unknown, currency: unknown) {
  const scale = String(currency).toUpperCase() === "USDT" ? 6 : 2;
  const left = decimalToMinorUnits(local, scale);
  const right = decimalToMinorUnits(provider, scale);
  return left !== null && right !== null && left === right;
}

function decimalToMinorUnits(value: unknown, scale: number) {
  const normalized = typeof value === "number"
    ? (Number.isFinite(value) ? value.toFixed(scale) : "")
    : String(value ?? "").trim();
  const match = new RegExp(`^(0|[1-9]\\d*)(?:\\.(\\d{1,${scale}}))?$`).exec(normalized);
  if (!match) return null;
  let multiplier = BigInt(1);
  for (let index = 0; index < scale; index += 1) multiplier *= BigInt(10);
  return BigInt(match[1]) * multiplier + BigInt((match[2] ?? "").padEnd(scale, "0"));
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
