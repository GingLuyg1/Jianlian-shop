import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/admin/api-auth";
import { assertUserBusinessAllowed, isAccountRestrictionError } from "@/lib/users/account-guard";
import type { PaymentBusinessType } from "@/lib/payments/channel-types";
import { getSafeErrorMessage, isPaymentSchemaMissing } from "@/lib/payments/payment-errors";
import {
  createPaymentSession,
  PaymentSessionError,
} from "@/lib/payments/payment-session-service";
import { evaluatePaymentRisk, riskResponseMessage, shouldBlockRisk } from "@/lib/risk/risk-service";
import { checkRateLimit, checkRequestSize, getBusinessRateLimitKey, getUserRateLimitKey } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const allowedKeys = ["businessType", "businessNo", "channel"];
const allowedBusinessTypes = ["order", "recharge", "account_recharge"];

export async function POST(request: Request) {
  const context = await requireApiUser();
  if (!context.ok) return context.response;

  const sizeError = checkRequestSize(request, 8 * 1024);
  if (sizeError) return sizeError;
  const userLimit = checkRateLimit("payment_session_create", getUserRateLimitKey(context.user.id, "payment_create"));
  if (!userLimit.allowed) return userLimit.response!;

  try {
    await assertUserBusinessAllowed(context.supabase, context.user.id, "create_payment");
  } catch (guardError) {
    if (isAccountRestrictionError(guardError)) {
      return NextResponse.json({ error: guardError.message, code: guardError.code }, { status: guardError.status });
    }
    throw guardError;
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || Object.keys(body).some((key) => !allowedKeys.includes(key))) {
    return NextResponse.json({ code: "REQUEST_INVALID", error: "支付请求参数不正确" }, { status: 400 });
  }

  const businessType = String(body.businessType ?? "").trim() as PaymentBusinessType;
  const businessNo = String(body.businessNo ?? "").trim();
  const channel = String(body.channel ?? "").trim();
  if (!allowedBusinessTypes.includes(businessType)) {
    return NextResponse.json({ code: "BUSINESS_TYPE_INVALID", error: "支付业务类型不支持" }, { status: 400 });
  }
  if (!businessNo) {
    return NextResponse.json({ code: "BUSINESS_NO_REQUIRED", error: "缺少业务单号" }, { status: 400 });
  }
  if (!channel) {
    return NextResponse.json({ code: "CHANNEL_REQUIRED", error: "请选择支付渠道" }, { status: 400 });
  }

  const businessLimit = checkRateLimit(
    "payment_session_create",
    getBusinessRateLimitKey(context.user.id, `${businessType}:${businessNo}`, "payment_create")
  );
  if (!businessLimit.allowed) return businessLimit.response!;

  try {
    const risk = await evaluatePaymentRisk({
      supabase: context.supabase,
      request,
      userId: context.user.id,
      businessId: businessNo,
      requestId: `${businessType}:${businessNo}:${channel}`,
      paymentChannel: channel,
      riskContext: { business_type: businessType },
    });

    if (shouldBlockRisk(risk) || risk.recommended_action === "require_review") {
      return NextResponse.json(
        {
          code: "PAYMENT_RISK_BLOCKED",
          error: riskResponseMessage(risk),
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

    const session = await createPaymentSession({
      businessType,
      businessNo,
      channelCode: channel,
      userId: context.user.id,
    });
    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    const schemaMissing = isPaymentSchemaMissing(error);
    const code =
      error instanceof PaymentSessionError
        ? error.code
        : schemaMissing
          ? "PAYMENT_SCHEMA_NOT_READY"
          : "PAYMENT_SESSION_CREATE_FAILED";
    const message = schemaMissing
      ? "支付会话数据表尚未初始化，请先执行 payment migration。"
      : getSafeErrorMessage(error, "支付会话创建失败，请稍后重试");
    return NextResponse.json({ code, error: message }, { status: schemaMissing ? 503 : 400 });
  }
}

