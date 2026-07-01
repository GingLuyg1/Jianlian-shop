import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/admin/api-auth";
import { recordApiError } from "@/lib/monitoring/logger";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const ALLOWED_LEVELS = new Set(["info", "warn", "error", "critical"]);
const MAX_PAGE_SIZE = 100;
const SUMMARY_LIMIT = 500;

type PerformanceRow = {
  id: string;
  level: string;
  title: string;
  message: string;
  route: string | null;
  request_id: string | null;
  error_code: string | null;
  occurrences: number;
  last_seen_at: string;
  metadata: Record<string, unknown> | null;
};

export async function GET(request: Request) {
  const admin = await requireApiAdmin();
  if (!admin.ok) return admin.response;

  const url = new URL(request.url);
  const page = clampNumber(url.searchParams.get("page"), 1, 1, 100000);
  const pageSize = clampNumber(url.searchParams.get("pageSize"), 20, 10, MAX_PAGE_SIZE);
  const route = sanitizeSearch(url.searchParams.get("route"), 120);
  const operation = sanitizeSearch(url.searchParams.get("operation"), 120);
  const level = sanitizeSearch(url.searchParams.get("level"), 20);
  const startAt = sanitizeDate(url.searchParams.get("startAt"));
  const endAt = sanitizeDate(url.searchParams.get("endAt"));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const service = getSupabaseServiceRoleClient();
  const client = service ?? admin.supabase;

  try {
    let listQuery = baseQuery(client)
      .select("id,level,title,message,route,request_id,error_code,occurrences,last_seen_at,metadata", { count: "exact" })
      .order("last_seen_at", { ascending: false })
      .range(from, to);

    listQuery = applyFilters(listQuery, { route, operation, level, startAt, endAt });

    let summaryQuery = baseQuery(client)
      .select("id,level,title,message,route,request_id,error_code,occurrences,last_seen_at,metadata")
      .order("last_seen_at", { ascending: false })
      .limit(SUMMARY_LIMIT);

    summaryQuery = applyFilters(summaryQuery, { route, operation, level, startAt, endAt });

    const [listResult, summaryResult] = await Promise.all([listQuery, summaryQuery]);
    if (listResult.error) throw listResult.error;

    const rows = ((listResult.data ?? []) as PerformanceRow[]).map(normalizeRow);
    const summaryRows = ((summaryResult.data ?? []) as PerformanceRow[]).map(normalizeRow);

    return NextResponse.json(
      {
        rows,
        count: listResult.count ?? 0,
        page,
        pageSize,
        summary: buildSummary(summaryRows, summaryResult.error ? "性能摘要加载失败" : ""),
        filters: { route, operation, level, startAt, endAt },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const requestId = await recordApiError({
      error,
      category: "performance",
      event: "admin_performance_list_failed",
      route: "/api/admin/system/performance",
      method: "GET",
      statusCode: isMissingSchema(error) ? 503 : 500,
      adminId: admin.user.id,
    });
    return NextResponse.json(
      {
        rows: [],
        count: 0,
        page,
        pageSize,
        summary: buildSummary([], "性能事件表尚未初始化或暂不可用"),
        error: isMissingSchema(error) ? "性能事件表尚未初始化，请先执行 system_error_events migration。" : "性能数据加载失败，请稍后重试。",
        requestId,
      },
      { status: isMissingSchema(error) ? 503 : 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

function baseQuery(client: any) {
  return client.from("system_error_events").eq("category", "performance");
}

function applyFilters(query: any, filters: { route: string; operation: string; level: string; startAt: string; endAt: string }) {
  let next = query;
  if (filters.level && ALLOWED_LEVELS.has(filters.level)) next = next.eq("level", filters.level);
  if (filters.route) next = next.ilike("route", `%${escapeLike(filters.route)}%`);
  if (filters.operation) next = next.ilike("title", `%${escapeLike(filters.operation)}%`);
  if (filters.startAt) next = next.gte("last_seen_at", filters.startAt);
  if (filters.endAt) next = next.lte("last_seen_at", filters.endAt);
  return next;
}

function normalizeRow(row: PerformanceRow) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const durationMs = toNumber(metadata.duration_ms);
  return {
    id: row.id,
    level: row.level,
    operation: safeText(metadata.operation) || row.title,
    route: row.route,
    requestId: row.request_id,
    queryType: safeText(metadata.query_type) || "unknown",
    resultCount: toNumber(metadata.result_count),
    durationMs,
    status: safeText(metadata.status) || (row.level === "error" || row.level === "critical" ? "failed" : "success"),
    occurrences: row.occurrences,
    lastSeenAt: row.last_seen_at,
    message: row.message,
  };
}

function buildSummary(rows: ReturnType<typeof normalizeRow>[], warning: string) {
  const durations = rows.map((row) => row.durationMs).filter((value): value is number => typeof value === "number").sort((a, b) => a - b);
  const routeCounts = new Map<string, { route: string; count: number; maxDurationMs: number | null }>();
  for (const row of rows) {
    const key = row.route ?? "unknown";
    const current = routeCounts.get(key) ?? { route: key, count: 0, maxDurationMs: null };
    current.count += row.occurrences || 1;
    if (typeof row.durationMs === "number") {
      current.maxDurationMs = current.maxDurationMs == null ? row.durationMs : Math.max(current.maxDurationMs, row.durationMs);
    }
    routeCounts.set(key, current);
  }
  return {
    sampleSize: rows.length,
    slowRequestCount: rows.reduce((sum, row) => sum + (row.occurrences || 1), 0),
    averageDurationMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
    p95DurationMs: durations.length ? durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)] : null,
    errorCount: rows.filter((row) => row.status === "failed").length,
    topRoutes: Array.from(routeCounts.values()).sort((a, b) => b.count - a.count).slice(0, 8),
    warning,
  };
}

function clampNumber(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function sanitizeSearch(value: string | null, maxLength: number) {
  return (value ?? "").trim().slice(0, maxLength);
}

function sanitizeDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function escapeLike(value: string) {
  return value.replace(/[%_]/g, "");
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeText(value: unknown) {
  return typeof value === "string" ? value.slice(0, 160) : "";
}

function isMissingSchema(error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return /system_error_events|schema cache|Could not find the table/i.test(message) || ["42P01", "42703", "PGRST205"].includes(code);
}

