import { NextResponse } from "next/server";

import {
  assertOrderExpirationJobAuthorized,
  listExpirableUnpaidOrdersDryRun,
  processExpiredOrders,
} from "@/lib/orders/order-expiration";
import { checkRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

type ExpirationRequestOptions = {
  limit?: unknown;
  reason?: unknown;
  dryRun?: unknown;
};

function parseLimit(value: unknown, fallback: number, max: number) {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
}

function parseDryRun(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes";
}

async function handleOrderExpirationRequest(request: Request, options: ExpirationRequestOptions) {
  const auth = assertOrderExpirationJobAuthorized(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const rateLimit = checkRateLimit("internal_task", "internal:order_expire_job");
  if (!rateLimit.allowed) return rateLimit.response!;

  const dryRun = parseDryRun(options.dryRun);
  const limit = dryRun ? parseLimit(options.limit, 10, 50) : parseLimit(options.limit, 50, 200);
  const reason = String(options.reason ?? "payment_timeout").trim().slice(0, 120) || "payment_timeout";

  if (dryRun) {
    const dryRunResult = await listExpirableUnpaidOrdersDryRun(limit);
    if (!dryRunResult.ok) {
      console.warn("[OrderExpiration] dry-run unavailable", {
        requestId: dryRunResult.requestId,
        code: dryRunResult.code,
      });

      return NextResponse.json(
        {
          success: false,
          requestId: dryRunResult.requestId,
          dry_run: true,
          readiness_code: "CODE_OR_DB_NOT_READY",
          error_code: dryRunResult.code,
          error: dryRunResult.message,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      requestId: dryRunResult.requestId,
      dry_run: true,
      candidate_count: dryRunResult.candidateCount,
      candidates: dryRunResult.candidates.map((item) => ({
        order_id_summary: item.orderIdSummary,
      })),
    });
  }

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

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  return handleOrderExpirationRequest(request, {
    limit: searchParams.get("limit"),
    dryRun: searchParams.get("dry_run"),
  });
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as { limit?: number; reason?: string; dry_run?: boolean } | null;
  return handleOrderExpirationRequest(request, {
    limit: payload?.limit,
    reason: payload?.reason,
    dryRun: payload?.dry_run,
  });
}
