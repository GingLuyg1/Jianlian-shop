import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { runAdminGlobalSearch } from "@/lib/admin/global-search";
import { maskBusinessKeyword, normalizeBusinessKeyword } from "@/lib/business/business-ids";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 40;
const buckets = new Map<string, { count: number; resetAt: number }>();

function getIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function hitRateLimit(key: string) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT_MAX;
}

export async function GET(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    await writeAdminAuditLog({
      request,
      action: "global_search",
      module: "system",
      targetType: "global_search",
      result: "denied",
      errorMessage: admin.message,
    });
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const url = new URL(request.url);
  const keyword = normalizeBusinessKeyword(url.searchParams.get("q"));
  if (!keyword) return NextResponse.json({ keyword: "", groups: [], total: 0 });
  if (keyword.length < 2) return NextResponse.json({ error: "请输入至少 2 个字符" }, { status: 400 });
  if (keyword.length > 80) return NextResponse.json({ error: "搜索关键词过长" }, { status: 400 });

  const rateKey = `${admin.user.id}:${getIp(request)}`;
  if (hitRateLimit(rateKey)) {
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "global_search_rate_limited",
      module: "system",
      targetType: "global_search",
      result: "failed",
      errorCode: "rate_limited",
      errorMessage: "搜索过于频繁",
      metadata: { keyword: maskBusinessKeyword(keyword), length: keyword.length },
    });
    return NextResponse.json({ error: "搜索过于频繁，请稍后再试" }, { status: 429 });
  }

  const serviceClient = getSupabaseServiceRoleClient();
  if (!serviceClient) {
    return NextResponse.json({ error: "后台搜索服务未完成初始化，请配置服务端 Supabase 权限" }, { status: 503 });
  }

  try {
    const result = await runAdminGlobalSearch(serviceClient, keyword);
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "global_search",
      module: "system",
      targetType: "global_search",
      result: "success",
      metadata: {
        keyword: maskBusinessKeyword(keyword),
        length: keyword.length,
        total: result.total,
        groups: result.groups.map((group) => ({ group: group.group, count: group.results.length })),
      },
    });
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "global_search",
      module: "system",
      targetType: "global_search",
      result: "failed",
      errorMessage: "后台搜索失败",
      metadata: { keyword: maskBusinessKeyword(keyword), length: keyword.length },
    });
    return NextResponse.json({ error: "后台搜索失败，请稍后重试" }, { status: 500 });
  }
}
