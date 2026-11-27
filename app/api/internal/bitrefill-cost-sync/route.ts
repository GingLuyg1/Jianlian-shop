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
  const expected = process.env.BITREFILL_COST_SYNC_JOB_SECRET?.trim();
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

let running = false;

async function run(request: Request, mode: "dry_run" | "apply") {
  const requestId = randomUUID();
  if (!hasValidInternalBearer(request)) {
    return json({ error: "内部任务鉴权失败", code: "INTERNAL_CRON_UNAUTHORIZED", requestId }, 401);
  }

  const service = getSupabaseServiceRoleClient();
  if (!service) {
    return json({ error: "数据库服务未就绪", code: "SERVICE_UNAVAILABLE", requestId }, 503);
  }

  if (new URL(request.url).search) {
    return json({ error: "成本同步只接受服务端策略", code: "INVALID_COST_SYNC_PARAMETERS", requestId }, 400);
  }
  if (running) return json({ error: "成本同步正在执行", code: "COST_SYNC_BUSY", requestId }, 409);
  running = true;

  try {
    const report = await syncBitrefillCostsAndRates(service, {
      mode,
      updateRetailPrice: mode === "apply" && process.env.BITREFILL_COST_SYNC_UPDATE_RETAIL_PRICE === "true",
      notifyOnAnomaly: mode === "apply",
    });
    return json({ ok: true, requestId, ...report });
  } catch (error) {
    console.error("[InternalBitrefillCostSync] failed", {
      requestId,
      message: error instanceof Error ? error.message : JSON.stringify(error),
    });
    return json({ error: "Bitrefill 定时成本同步失败", code: "BITREFILL_COST_SYNC_FAILED", requestId }, 503);
  } finally {
    running = false;
  }
}


export function GET(request: Request) {
  return run(request, "dry_run");
}

export function POST(request: Request) {
  return run(request, "apply");
}
