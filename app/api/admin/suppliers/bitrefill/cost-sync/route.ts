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
  const expected = String(process.env.INTERNAL_CRON_SECRET ?? "").trim();
  const auth = String(request.headers.get("authorization") ?? "").trim();
  if (!expected || !auth.startsWith("Bearer ")) return false;
  const provided = auth.slice(7).trim();
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
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
  try {
    const report = await syncBitrefillCostsAndRates(service, {
      mode: "dry_run",
      notifyOnAnomaly: true,
    });
    return json({ ok: true, requestId, ...report });
  } catch (error) {
    console.error("[BitrefillCostSync] dry_run failed", {
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
    notifyOnAnomaly?: boolean;
  };

  try {
    const report = await syncBitrefillCostsAndRates(service, {
      mode: body.mode === "apply" ? "apply" : "dry_run",
      updateRetailPrice: Boolean(body.updateRetailPrice),
      capBufferPercent: body.capBufferPercent,
      markupPercent: body.markupPercent,
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
