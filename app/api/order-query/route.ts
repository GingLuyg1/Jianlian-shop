import { NextResponse } from "next/server";

import { lookupGuestOrder, lookupGuestOrdersByEmail } from "@/lib/orders/order-query-service";
import { checkRateLimit, checkRequestSize, getBusinessRateLimitKey, getRequestSourceKey } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const GENERIC_ERROR = "订单信息或验证信息不正确";
const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getErrorMessage(error: unknown, fallback = "订单查询失败，请稍后重试") {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function POST(request: Request) {
  const sizeError = checkRequestSize(request, 8 * 1024);
  if (sizeError) return sizeError;

  const sourceKey = getRequestSourceKey(request);
  const sourceLimit = checkRateLimit("order_lookup", sourceKey);
  if (!sourceLimit.allowed) return sourceLimit.response!;

  try {
    const body = (await request.json().catch(() => null)) as {
      mode?: string;
      email?: string;
      orderNo?: string;
      queryToken?: string;
    } | null;

    const mode = String(body?.mode ?? "").trim().toLowerCase();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const orderNo = String(body?.orderNo ?? "").trim();
    const queryToken = String(body?.queryToken ?? "").trim();

    if (mode === "email" || (email && !orderNo && !queryToken)) {
      if (!email || email.length > 254 || !SIMPLE_EMAIL_REGEX.test(email)) {
        return NextResponse.json({ error: "请输入有效的下单邮箱地址" }, { status: 400 });
      }

      const emailLimit = checkRateLimit("order_lookup", getBusinessRateLimitKey("guest_email", email, "order_lookup"));
      if (!emailLimit.allowed) return emailLimit.response!;

      const result = await lookupGuestOrdersByEmail(email);
      if (!result.ok) {
        if (result.reason === "unavailable") {
          return NextResponse.json({ error: "订单查询暂时不可用，请稍后重试" }, { status: 503 });
        }
        return NextResponse.json({ error: "请输入有效的下单邮箱地址" }, { status: 400 });
      }

      return NextResponse.json({
        orders: result.orders,
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

    return NextResponse.json({ order: result.order });
  } catch (error) {
    console.error("[OrderQuery] lookup failed", getErrorMessage(error));
    return NextResponse.json({ error: "订单查询暂时不可用，请稍后重试" }, { status: 500 });
  }
}
