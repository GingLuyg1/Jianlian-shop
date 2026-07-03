import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { processDueEmailDeliveryJobs } from "@/lib/email/jobs";

export const dynamic = "force-dynamic";

function secureEqual(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.EMAIL_WORKER_SECRET?.trim();
  const suppliedSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!configuredSecret) return NextResponse.json({ error: "邮件 Worker 尚未配置。" }, { status: 503 });
  if (!suppliedSecret || !secureEqual(suppliedSecret, configuredSecret)) {
    return NextResponse.json({ error: "无权执行邮件任务。" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { limit?: unknown };
  const limit = Math.min(25, Math.max(1, Number(body.limit ?? 20) || 20));
  const result = await processDueEmailDeliveryJobs(limit, "internal_worker");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json(result.summary, { headers: { "Cache-Control": "no-store" } });
}
