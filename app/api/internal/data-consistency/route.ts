import { NextResponse } from "next/server";

import { runDataConsistencyScan } from "@/lib/consistency/scanner";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.DATA_CONSISTENCY_SCAN_SECRET;
  if (!secret) return { ok: false, status: 503, error: "数据巡检密钥未配置。" };
  const header = request.headers.get("x-data-consistency-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === secret ? { ok: true } : { ok: false, status: 401, error: "无权执行数据巡检。" };
}

export async function POST(request: Request) {
  const auth = authorized(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const result = await runDataConsistencyScan({ runType: "scheduled", persist: true, triggeredBy: null });
  return NextResponse.json(result);
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "数据巡检接口可用。请使用 POST 并携带 x-data-consistency-secret。" });
}
