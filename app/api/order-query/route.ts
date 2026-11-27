import { NextResponse } from "next/server";

import { lookupGuestOrder, lookupGuestOrdersByEmail } from "@/lib/orders/order-query-service";
import { loadVerifiedTokenDeliveries } from "@/lib/orders/order-token-delivery";
import { checkRateLimit, readBoundedJsonBody, getBusinessRateLimitKey, getClientIp, getRequestSourceKey } from "@/lib/security/rate-limit";
import { getTurnstileSiteKey, isTurnstileConfigured, verifyTurnstileToken } from "@/lib/security/turnstile";

import { generateAndSendEmailCode, verifyEmailCode } from "@/lib/security/email-code-service";

export const dynamic = "force-dynamic";

const GENERIC_ERROR = "订单信息或验证信息不正确";
const SIMPLE_EMAIL_REGEX = /^[^\s@%\\]+@[^\s@%\\]+\.[^\s@%\\]+$/;

function getErrorMessage(error: unknown, fallback = "订单查询失败，请稍后重试") {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function GET() {
  return NextResponse.json({
    turnstileEnabled: isTurnstileConfigured(),
    turnstileSiteKey: getTurnstileSiteKey(),
  });
}

export async function POST(request: Request) {
  const sourceKey = getRequestSourceKey(request);
  const sourceLimit = checkRateLimit("order_lookup", sourceKey);
  if (!sourceLimit.allowed) return sourceLimit.response!;

  try {
    const parsed = await readBoundedJsonBody<{
      mode?: string;
      email?: string;
      turnstileToken?: string;
      orderNo?: string;
      queryToken?: string;
      emailCode?: string;
    } | null>(request, 8 * 1024);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const mode = String(body?.mode ?? "").trim().toLowerCase();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const orderNo = String(body?.orderNo ?? "").trim();
    const queryToken = String(body?.queryToken ?? "").trim();

    if (mode === "email" || mode === "email_request" || (email && !orderNo && !queryToken)) {
      if (!email || email.length > 254 || !SIMPLE_EMAIL_REGEX.test(email)) {
        return NextResponse.json({ error: "请输入有效的下单邮箱地址" }, { status: 400 });
      }

      const emailLimit = checkRateLimit("order_lookup", getBusinessRateLimitKey("guest_email", email, "order_lookup"));
      if (!emailLimit.allowed) return emailLimit.response!;

      if (mode === "email_request") {
        if (!isTurnstileConfigured()) {
          return NextResponse.json({ error: "邮箱验证暂时不可用，请使用订单号与查询凭证" }, { status: 503 });
        }
        const turnstileResult = await verifyTurnstileToken(body?.turnstileToken, getClientIp(request));
        if (!turnstileResult.ok) {
          return NextResponse.json(
            { error: turnstileResult.message, code: turnstileResult.code },
            { status: 400 }
          );
        }
        const sendLimit = checkRateLimit("auth_resend", getBusinessRateLimitKey("guest_email", email, "order_lookup_send"));
        if (!sendLimit.allowed) return sendLimit.response!;
        // A challenge is issued independently of whether this mailbox has orders.
        const sent = await generateAndSendEmailCode(email, "order_lookup");
        if (!sent.ok && !sent.waitSeconds) {
          return NextResponse.json({ error: "验证码暂时无法发送，请稍后重试" }, { status: 503 });
        }
        return NextResponse.json({ status: "verification_required" });
      }

      const code = typeof body?.emailCode === "string" ? body.emailCode.trim() : "";
      if (!/^\d{6}$/.test(code) || !verifyEmailCode(email, "order_lookup", code).valid) {
        return NextResponse.json({ error: "请填写有效的邮箱验证码", code: "EMAIL_VERIFICATION_REQUIRED" }, { status: 403 });
      }

      const result = await lookupGuestOrdersByEmail(email);
      if (!result.ok) {
        if (result.reason === "unavailable") {
          return NextResponse.json({ error: "订单查询暂时不可用，请稍后重试" }, { status: 503 });
        }
        return NextResponse.json({ error: "请输入有效的下单邮箱地址" }, { status: 400 });
      }

      return NextResponse.json({
        orders: result.orders,
        turnstileRequired: isTurnstileConfigured(),
      });
    }

    if (orderNo) {
      const orderLimit = checkRateLimit("order_lookup", getBusinessRateLimitKey("guest", orderNo, "order_lookup"));
      if (!orderLimit.allowed) return orderLimit.response!;
    }

    if (!orderNo || !queryToken) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
    }

    const result = await lookupGuestOrder(orderNo, queryToken);
    if (!result.ok) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 404 });
    }

    const deliveries =
      result.order.paymentStatus === "paid"
        ? await loadVerifiedTokenDeliveries(result.order.orderNo).catch(() => [])
        : [];

    return NextResponse.json({
      order: {
        ...result.order,
        deliveries,
      },
    });
  } catch (error) {
    console.error("[OrderQuery] lookup failed", getErrorMessage(error));
    return NextResponse.json({ error: "订单查询暂时不可用，请稍后重试" }, { status: 500 });
  }
}
