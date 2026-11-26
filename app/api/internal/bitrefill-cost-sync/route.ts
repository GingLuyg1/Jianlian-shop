import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { syncBitrefillCostsAndRates } from "@/lib/providers/bitrefill/cost-sync-service";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function hasValidInternalBearer(request: Request) {
  const auth = String(request.headers.get("authorization") ?? "").trim();
  if (!auth.startsWith("Bearer ")) return false;
  const provided = auth.slice(7).trim();
  if (!provided) return false;
  const candidates = [
    process.env.INTERNAL_CRON_SECRET,
    process.env.INTERNAL_JOB_SECRET,
    process.env.CRON_SECRET,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const a = Buffer.from(provided);
  return candidates.some((expected) => {
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

export async function GET(request: Request) {
  const requestId = randomUUID();
  if (!hasValidInternalBearer(request)) {
    return json({ error: "内部任务鉴权失败", code: "INTERNAL_CRON_UNAUTHORIZED", requestId }, 401);
  }

  const service = getSupabaseServiceRoleClient();
  if (!service) {
    return json({ error: "数据库服务未就绪", code: "SERVICE_UNAVAILABLE", requestId }, 503);
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "apply" ? "apply" : "dry_run";
  const updateRetailPrice = url.searchParams.get("updateRetailPrice") === "1";
  const markupPercent = url.searchParams.get("markupPercent")
    ? Number(url.searchParams.get("markupPercent"))
    : undefined;
  const capBufferPercent = url.searchParams.get("capBufferPercent")
    ? Number(url.searchParams.get("capBufferPercent"))
    : undefined;
  const maxPriceDriftPercent = url.searchParams.get("maxPriceDriftPercent")
    ? Number(url.searchParams.get("maxPriceDriftPercent"))
    : undefined;

  try {
    const report = await syncBitrefillCostsAndRates(service, {
      mode,
      updateRetailPrice,
      markupPercent,
      capBufferPercent,
      maxPriceDriftPercent,
      notifyOnAnomaly: true,
    });
    return json({ ok: true, requestId, ...report });
  } catch (error) {
    console.error("[InternalBitrefillCostSync] failed", {
      requestId,
      message: error instanceof Error ? error.message : String(error),
    });
    return json({ error: "Bitrefill 定时成本同步失败", code: "BITREFILL_COST_SYNC_FAILED", requestId }, 503);
  }
}
