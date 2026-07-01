import { NextResponse } from "next/server";

import { assertOrderExpirationJobAuthorized, processExpiredOrders } from "@/lib/orders/order-expiration";
import { checkRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = assertOrderExpirationJobAuthorized(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const rateLimit = checkRateLimit("internal_task", "internal:order_expire_job");
  if (!rateLimit.allowed) return rateLimit.response!;

  const payload = (await request.json().catch(() => null)) as { limit?: number; reason?: string } | null;
  const limit = Math.max(1, Math.min(Number(payload?.limit ?? 50) || 50, 200));
  const reason = String(payload?.reason ?? "payment_timeout").trim().slice(0, 120) || "payment_timeout";

  const result = await processExpiredOrders(limit, reason);
  return NextResponse.json({
    requestId: result.requestId,
    processed: result.processed,
    skipped: result.skipped,
    failed: result.failed,
    results: result.results.map((item) => ({
      ok: item.ok,
      code: item.code,
      orderId: item.orderId,
      orderNo: item.orderNo,
      releasedNormal: item.releasedNormal,
      releasedSku: item.releasedSku,
      releasedDigital: item.releasedDigital,
      message: item.message,
    })),
  });
}

