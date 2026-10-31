import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/admin/api-auth";
import { parseDashboardAnalyticsQuery } from "@/lib/admin/dashboard-analytics-query.mjs";
import { PRODUCT_DASHBOARD_SORTS } from "@/lib/admin/product-dashboard-sort.mjs";
import { getAdminRateLimitKey } from "@/lib/security/rate-limit";
import { checkRateLimit } from "@/lib/admin/dashboard-read-rate-limit";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
const DEFAULT_PAGE_SIZE = 10;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type ProductRow = { id: string; name: string; paidOrders: number; units: number; amountCny: null };
type DailyRow = { date: string; paidOrders: number; units: number };

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status, headers });
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validPayload(value: unknown, page: number, pageSize: number, productId: string, from: string, dayCount: number): value is {
  total: number; rows: ProductRow[]; daily: DailyRow[];
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  if (!count(data.total) || !Array.isArray(data.rows) || !Array.isArray(data.daily)) return false;
  const expectedRows = Math.max(0, Math.min(pageSize, data.total - (page - 1) * pageSize));
  if (data.rows.length !== expectedRows || data.daily.length !== (productId ? dayCount : 0)
    || (productId && data.total > 1)) return false;
  const seen = new Set<string>();
  for (const row of data.rows) {
    if (!row || typeof row !== "object") return false;
    const item = row as Record<string, unknown>;
    if (typeof item.id !== "string" || !uuid.test(item.id) || seen.has(item.id)
      || typeof item.name !== "string" || !count(item.paidOrders)
      || !count(item.units) || item.amountCny !== null) return false;
    seen.add(item.id);
  }
  let dailyOrders = 0;
  let dailyUnits = 0;
  const firstDay = Date.parse(`${from}T00:00:00Z`);
  for (let index = 0; index < data.daily.length; index++) {
    const row = data.daily[index];
    if (!row || typeof row !== "object") return false;
    const item = row as Record<string, unknown>;
    if (item.date !== new Date(firstDay + index * 86_400_000).toISOString().slice(0, 10)
      || !count(item.paidOrders) || !count(item.units)) return false;
    dailyOrders += item.paidOrders;
    dailyUnits += item.units;
  }
  if (productId && page === 1 && data.total === 1) {
    const row = data.rows[0] as ProductRow;
    if (dailyOrders !== row.paidOrders || dailyUnits !== row.units) return false;
  }
  return true;
}

export async function GET(request: Request) {
  const admin = await requireApiAdmin();
  if (!admin.ok) {
    admin.response.headers.set("Cache-Control", headers["Cache-Control"]);
    return admin.response;
  }
  const params = new URL(request.url).searchParams;
  const range = parseDashboardAnalyticsQuery(new URLSearchParams({ from: params.get("from") ?? "", to: params.get("to") ?? "" }));
  if (!range.ok) return fail(400, "日期范围无效，单次最多查询 365 个上海自然日。");
  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("pageSize") ?? String(DEFAULT_PAGE_SIZE));
  const search = (params.get("search") ?? "").trim();
  const sort = params.get("sort") ?? "paidOrders_desc";
  const productId = params.get("productId") ?? "";
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || ![10, 15].includes(pageSize)
    || search.length > 80 || !PRODUCT_DASHBOARD_SORTS.includes(sort)
    || (productId && !uuid.test(productId))) return fail(400, "商品筛选条件无效。");

  const rate = checkRateLimit("admin_analytics_read", getAdminRateLimitKey(admin.user.id, "dashboard_products"));
  if (!rate.allowed) {
    rate.response!.headers.set("Cache-Control", headers["Cache-Control"]);
    return rate.response!;
  }
  const service = getSupabaseServiceRoleClient();
  if (!service) return fail(503, "商品统计只读服务尚未启用。");

  // One SQL statement supplies a single snapshot; EXECUTE is restricted to service_role.
  let result;
  try {
    result = await service.rpc("admin_product_dashboard_v25_snapshot", {
      p_from: range.from, p_to: range.to, p_page: page, p_page_size: pageSize,
      p_search: search, p_sort: sort,
      ...(productId ? { p_product_id: productId } : {}),
    }, { get: true }).abortSignal(AbortSignal.timeout(8_000));
  } catch {
    return fail(503, "商品统计查询超时或连接失败，请稍后重试。");
  }
  if (result.error) return fail(503, "商品统计读取失败或历史凭据不完整。");
  const dayCount = Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000) + 1;
  if (!validPayload(result.data, page, pageSize, productId, range.from, dayCount)) return fail(503, "商品统计结果不完整。");
  if (productId && result.data.total === 0) return fail(404, "商品不存在或已不可读取。");

  return NextResponse.json({
    ok: true, from: range.from, to: range.to, page, pageSize,
    total: result.data.total, sort, rows: result.data.rows, daily: result.data.daily,
    unavailable: ["impressions", "clicks", "clickRate", "orderRate", "paymentRate", "amountCny"],
  }, { headers });
}
