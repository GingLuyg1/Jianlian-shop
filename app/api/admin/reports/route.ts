import { NextResponse } from "next/server";

import { getServerAdminContext } from "@/lib/auth/require-admin";
import { loadBusinessReport, normalizeReportError, normalizeReportRange } from "@/lib/reports/business-reports";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  try {
    const url = new URL(request.url);
    const range = normalizeReportRange(url.searchParams.get("start"), url.searchParams.get("end"));
    const report = await loadBusinessReport(admin.supabase, range);
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json({ error: normalizeReportError(error, "经营报表加载失败") }, { status: 400 });
  }
}
