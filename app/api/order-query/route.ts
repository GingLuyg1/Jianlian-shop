import { NextResponse } from "next/server";

import { lookupGuestOrder } from "@/lib/orders/order-query-service";
import { checkRateLimit, checkRequestSize, getBusinessRateLimitKey, getRequestSourceKey } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const GENERIC_ERROR = "订单信息或验证信息不正确";

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

  const sourceLimit = checkRateLimit("order_lookup", getRequestSourceKey(request));
  if (!sourceLimit.allowed) return sourceLimit.response!;

  try {
    const body = (await request.json().catch(() => null)) as { orderNo?: string; queryToken?: string } | null;
    const orderNo = String(body?.orderNo ?? "").trim();
    const queryToken = String(body?.queryToken ?? "").trim();

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
