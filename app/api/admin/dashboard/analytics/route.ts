import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/admin/api-auth";
import { parseDashboardAnalyticsQuery } from "@/lib/admin/dashboard-analytics-query.mjs";
import { parseDashboardAnalytics } from "@/lib/admin/dashboard-analytics-ui";
import { checkRateLimit, getAdminRateLimitKey } from "@/lib/security/rate-limit";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };
const RPC_NAME = "admin_dashboard_analytics_v23";

function failure(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, error: message }, { status, headers: NO_STORE });
}

export async function GET(request: Request) {
  const admin = await requireApiAdmin();
  if (!admin.ok) {
    admin.response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return admin.response;
  }

  const parsed = parseDashboardAnalyticsQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return failure(400, parsed.code, "日期范围无效或超出 365 天限制。");

  const rate = checkRateLimit("admin_analytics_read", getAdminRateLimitKey(admin.user.id, "dashboard_analytics"));
  if (!rate.allowed) {
    rate.response!.headers.set("Cache-Control", "private, no-store, max-age=0");
    return rate.response!;
  }

  const service = getSupabaseServiceRoleClient();
  if (!service) return failure(503, "READONLY_AGGREGATE_SCHEMA_PENDING", "统计服务尚未启用。");

  try {
    // This is a single database function call, not browser-side pagination.
    // The candidate SQL grants EXECUTE only to the server-side service role.
    const { data, error } = await service.rpc(RPC_NAME, { p_from: parsed.from, p_to: parsed.to });
    if (error) {
      if (/PGRST202|42883|schema cache|function .* does not exist/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) {
        return failure(503, "READONLY_AGGREGATE_SCHEMA_PENDING", "统计函数尚未启用。");
      }
      if (error.code === "57014") return failure(504, "ANALYTICS_TIMEOUT", "统计查询超时，请缩短日期范围。");
      return failure(503, "ANALYTICS_INCOMPLETE", "统计数据未能完整读取，请稍后重试。");
    }
    try {
      parseDashboardAnalytics({ ok: true, data }, parsed.from, parsed.to);
    } catch {
      return failure(503, "ANALYTICS_INCOMPLETE", "统计结果不完整，无法展示。");
    }
    return NextResponse.json({ ok: true, data }, { headers: NO_STORE });
  } catch {
    return failure(503, "ANALYTICS_UNAVAILABLE", "统计服务暂时不可用。");
  }
}
