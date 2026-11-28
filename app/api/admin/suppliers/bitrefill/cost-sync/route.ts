import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { getServerSuperAdminContext } from "@/lib/auth/require-admin";
import { syncBitrefillCostsAndRates } from "@/lib/providers/bitrefill/cost-sync-service";
import { checkRateLimit, checkRequestSize, getUserRateLimitKey } from "@/lib/security/rate-limit";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function hasValidInternalCronBearer(request: Request) {
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
  const isCron = hasValidInternalCronBearer(request);
  if (!isCron) {
    const admin = await getServerSuperAdminContext();
    if (!admin.ok) {
      return json({ error: admin.message, code: "BITREFILL_ADMIN_REQUIRED", requestId }, admin.status);
    }
  }
  const service = getSupabaseServiceRoleClient();
  if (!service) {
    return json({ error: "数据库服务未就绪", code: "SERVICE_UNAVAILABLE", requestId }, 503);
  }
  const url = new URL(request.url);
  const requestedMode = url.searchParams.get("mode") === "apply" && isCron ? "apply" : "dry_run";
  const updateRetailPrice = isCron && url.searchParams.get("updateRetailPrice") === "1";
  const markupPercent = url.searchParams.get("markupPercent") ? Number(url.searchParams.get("markupPercent")) : undefined;
  const simMarkupPercent = url.searchParams.get("simMarkupPercent") ? Number(url.searchParams.get("simMarkupPercent")) : undefined;
  const capBufferPercent = url.searchParams.get("capBufferPercent") ? Number(url.searchParams.get("capBufferPercent")) : undefined;
  const maxPriceDriftPercent = url.searchParams.get("maxPriceDriftPercent") ? Number(url.searchParams.get("maxPriceDriftPercent")) : undefined;
  try {
    const report = await syncBitrefillCostsAndRates(service, {
      mode: requestedMode,
      updateRetailPrice,
      markupPercent,
      simMarkupPercent,
      capBufferPercent,
      maxPriceDriftPercent,
      notifyOnAnomaly: true,
    });
    return json({ ok: true, requestId, ...report });
  } catch (error) {
    console.error("[BitrefillCostSync] sync failed", {
      requestId,
      message: error instanceof Error ? error.message : String(error),
    });
    return json({ error: "Bitrefill 成本巡检失败", code: "BITREFILL_COST_SYNC_FAILED", requestId }, 503);
  }
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const admin = await getServerSuperAdminContext();
  if (!admin.ok) {
    return json({ error: admin.message, code: "BITREFILL_ADMIN_REQUIRED", requestId }, admin.status);
  }
  const sizeError = checkRequestSize(request, 8 * 1024);
  if (sizeError) return sizeError;
  const rate = checkRateLimit("admin_write", getUserRateLimitKey(admin.user.id, "bitrefill_cost_sync"));
  if (!rate.allowed) return rate.response!;

  const service = getSupabaseServiceRoleClient();
  if (!service) {
    return json({ error: "数据库服务未就绪", code: "SERVICE_UNAVAILABLE", requestId }, 503);
  }

  const body = (await request.json().catch(() => ({}))) as {
    mode?: "dry_run" | "apply";
    updateRetailPrice?: boolean;
    capBufferPercent?: number;
    markupPercent?: number;
    simMarkupPercent?: number;
    maxPriceDriftPercent?: number;
    notifyOnAnomaly?: boolean;
  };

  try {
    const report = await syncBitrefillCostsAndRates(service, {
      mode: body.mode === "apply" ? "apply" : "dry_run",
      updateRetailPrice: Boolean(body.updateRetailPrice),
      capBufferPercent: body.capBufferPercent,
      markupPercent: body.markupPercent,
      simMarkupPercent: body.simMarkupPercent,
      maxPriceDriftPercent: body.maxPriceDriftPercent,
      notifyOnAnomaly: body.notifyOnAnomaly !== false,
    });
    return json({ ok: true, requestId, ...report });
  } catch (error) {
    console.error("[BitrefillCostSync] sync failed", {
      requestId,
      message: error instanceof Error ? error.message : String(error),
    });
    return json({ error: "Bitrefill 实时成本同步失败", code: "BITREFILL_COST_SYNC_FAILED", requestId }, 503);
  }
}
