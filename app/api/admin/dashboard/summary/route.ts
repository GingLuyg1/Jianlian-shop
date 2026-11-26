import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/admin/api-auth";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { requiresRechargeAdminAttention } from "@/lib/recharges/admin-attention";
import { getAdminTicketCountsFast } from "@/lib/tickets/server";
import { POSTGREST_PAGE_SIZE, selectAllPaginated } from "@/lib/supabase/paginated-select";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 30_000;

type DashboardFastSummaryPayload = {
  cachedAt: string;
  today: {
    payAmount: number;
    yesterdayPayAmount: number;
    rechargeAmount: number;
    yesterdayRechargeAmount: number;
    orderCount: number;
    yesterdayOrderCount: number;
    paidOrderCount: number;
    yesterdayPaidOrderCount: number;
    buyersCount: number;
    uv: number;
    yesterdayUv: number;
    pv: number;
    yesterdayPv: number;
    newUsers: number;
    yesterdayNewUsers: number;
  };
  todos: {
    pendingOrders: number;
    manualDelivery: number;
    autoDeliveryFailed: number;
    inventoryShortage: number;
    paymentExceptionSessions: number;
    callbackFailed: number;
    reconciliationFailed: number;
    pendingRecharges: number;
    lowStockProducts: number;
    activeProducts: number;
    pendingTickets: number;
    resolvedTickets: number;
  };
};

let summaryCache: { expiresAt: number; payload: DashboardFastSummaryPayload } | null = null;

function shanghaiDayStartIso(offsetDays = 0): string {
  const now = new Date();
  const shanghaiStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const base = new Date(`${shanghaiStr}T00:00:00+08:00`);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString();
}

function safeNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isRechargeSucceeded(status: unknown): boolean {
  return status === "succeeded" || status === "paid" || status === "completed";
}

export async function GET(request: Request) {
  const admin = await requireApiAdmin();
  if (!admin.ok) return admin.response;

  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";
  if (!forceRefresh && summaryCache && summaryCache.expiresAt > Date.now()) {
    return NextResponse.json(summaryCache.payload, {
      headers: { "Cache-Control": "no-store", "X-Dashboard-Cache": "HIT" },
    });
  }

  const service = getSupabaseServiceRoleClient() ?? admin.supabase;
  const todayIso = shanghaiDayStartIso(0);
  const yesterdayIso = shanghaiDayStartIso(-1);
  const tomorrowIso = shanghaiDayStartIso(1);
  const thirtyDaysAgoIso = shanghaiDayStartIso(-29);

  const [
    recentOrdersRes,
    recentRechargesRes,
    recentVisitsRes,
    newUsersRes,
    pendingOrdersCountRes,
    deliveriesRes,
    exceptionSessionsCountRes,
    callbacksRes,
    reconciliationsRes,
    pendingRechargesRes,
    lowStockSingleRes,
    activeProductsRes,
    ticketCounts,
  ] = await Promise.all([
    selectAllPaginated<Record<string, unknown>>(
      (from, to) =>
        service
          .from("orders")
          .select("id,customer_email,total_amount,status,payment_status,created_at,paid_at")
          .gte("created_at", yesterdayIso)
          .lt("created_at", tomorrowIso)
          .order("created_at", { ascending: false })
          .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message?: string } | null }>,
      { pageSize: POSTGREST_PAGE_SIZE, maxRows: 10000 }
    ),
    selectAllPaginated<Record<string, unknown>>(
      (from, to) =>
        service
          .from("account_recharges")
          .select("id,amount,requested_amount,credited_amount,status,created_at,paid_at")
          .gte("created_at", yesterdayIso)
          .lt("created_at", tomorrowIso)
          .order("created_at", { ascending: false })
          .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message?: string } | null }>,
      { pageSize: POSTGREST_PAGE_SIZE, maxRows: 10000 }
    ),
    selectAllPaginated<Record<string, unknown>>(
      (from, to) =>
        service
          .from("page_visit_events")
          .select("visit_date,visitor_key")
          .gte("visit_date", yesterdayIso)
          .lt("visit_date", tomorrowIso)
          .not("page_path", "like", "/admin%")
          .order("visit_date", { ascending: false })
          .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message?: string } | null }>,
      { pageSize: POSTGREST_PAGE_SIZE, maxRows: 20000 }
    ),
    selectAllPaginated<Record<string, unknown>>(
      (from, to) =>
        service
          .from("profiles")
          .select("id,created_at")
          .gte("created_at", yesterdayIso)
          .lt("created_at", tomorrowIso)
          .order("created_at", { ascending: false })
          .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message?: string } | null }>,
      { pageSize: POSTGREST_PAGE_SIZE, maxRows: 10000 }
    ),
    service
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["paid", "processing"])
      .gte("created_at", thirtyDaysAgoIso),
    selectAllPaginated<Record<string, unknown>>(
      (from, to) =>
        service
          .from("order_deliveries")
          .select("delivery_status,delivery_type,failure_reason")
          .gte("created_at", thirtyDaysAgoIso)
          .in("delivery_status", ["pending", "failed"])
          .order("created_at", { ascending: false })
          .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message?: string } | null }>,
      { pageSize: POSTGREST_PAGE_SIZE, maxRows: 10000 }
    ),
    service
      .from("payment_sessions")
      .select("id", { count: "exact", head: true })
      .in("status", ["failed", "expired"])
      .gte("created_at", thirtyDaysAgoIso),
    selectAllPaginated<Record<string, unknown>>(
      (from, to) =>
        service
          .from("payment_callback_logs")
          .select("signature_result,process_result")
          .gte("received_at", thirtyDaysAgoIso)
          .order("received_at", { ascending: false })
          .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message?: string } | null }>,
      { pageSize: POSTGREST_PAGE_SIZE, maxRows: 10000 }
    ),
    selectAllPaginated<Record<string, unknown>>(
      (from, to) =>
        service
          .from("payment_reconciliations")
          .select("result,recovery_status")
          .gte("created_at", thirtyDaysAgoIso)
          .order("created_at", { ascending: false })
          .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message?: string } | null }>,
      { pageSize: POSTGREST_PAGE_SIZE, maxRows: 10000 }
    ),
    selectAllPaginated<Record<string, unknown>>(
      (from, to) =>
        service
          .from("account_recharges")
          .select("status,review_mode,exception_type,error_summary")
          .gte("created_at", thirtyDaysAgoIso)
          .order("created_at", { ascending: false })
          .range(from, to) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message?: string } | null }>,
      { pageSize: POSTGREST_PAGE_SIZE, maxRows: 10000 }
    ),
    service
      .from("products")
      .select("id", { count: "exact", head: true })
      .gt("stock", 0)
      .lte("stock", 5),
    service
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    getAdminTicketCountsFast().catch(() => ({ total: 0, processing: 0, completed: 0, flagged: 0, unread: 0 })),
  ]);

  const todayMs = Date.parse(todayIso);
  const yesterdayMs = Date.parse(yesterdayIso);

  let payAmount = 0;
  let yesterdayPayAmount = 0;
  let orderCount = 0;
  let yesterdayOrderCount = 0;
  let paidOrderCount = 0;
  let yesterdayPaidOrderCount = 0;
  const todayBuyers = new Set<string>();

  for (const row of recentOrdersRes.rows) {
    const createdMs = Date.parse(String(row.created_at ?? ""));
    const isToday = Number.isFinite(createdMs) && createdMs >= todayMs;
    const isYesterday = Number.isFinite(createdMs) && createdMs >= yesterdayMs && createdMs < todayMs;
    if (isToday) orderCount += 1;
    else if (isYesterday) yesterdayOrderCount += 1;

    if (row.payment_status === "paid") {
      if (isToday) {
        paidOrderCount += 1;
        payAmount += safeNum(row.total_amount);
        if (typeof row.customer_email === "string" && row.customer_email) {
          todayBuyers.add(row.customer_email);
        }
      } else if (isYesterday) {
        yesterdayPaidOrderCount += 1;
        yesterdayPayAmount += safeNum(row.total_amount);
      }
    }
  }

  let rechargeAmount = 0;
  let yesterdayRechargeAmount = 0;
  for (const row of recentRechargesRes.rows) {
    if (!isRechargeSucceeded(row.status)) continue;
    const createdMs = Date.parse(String(row.created_at ?? ""));
    const amt = safeNum(row.credited_amount ?? row.amount ?? row.requested_amount);
    if (Number.isFinite(createdMs) && createdMs >= todayMs) rechargeAmount += amt;
    else if (Number.isFinite(createdMs) && createdMs >= yesterdayMs && createdMs < todayMs) yesterdayRechargeAmount += amt;
  }

  let pv = 0;
  let yesterdayPv = 0;
  const todayUvSet = new Set<string>();
  const yesterdayUvSet = new Set<string>();
  for (const row of recentVisitsRes.rows) {
    const visitMs = Date.parse(String(row.visit_date ?? ""));
    const key = typeof row.visitor_key === "string" ? row.visitor_key : "";
    if (Number.isFinite(visitMs) && visitMs >= todayMs) {
      pv += 1;
      if (key) todayUvSet.add(key);
    } else if (Number.isFinite(visitMs) && visitMs >= yesterdayMs && visitMs < todayMs) {
      yesterdayPv += 1;
      if (key) yesterdayUvSet.add(key);
    }
  }

  let newUsers = 0;
  let yesterdayNewUsers = 0;
  for (const row of newUsersRes.rows) {
    const ms = Date.parse(String(row.created_at ?? ""));
    if (Number.isFinite(ms) && ms >= todayMs) newUsers += 1;
    else if (Number.isFinite(ms) && ms >= yesterdayMs && ms < todayMs) yesterdayNewUsers += 1;
  }

  const deliveries = deliveriesRes.rows;
  const manualDelivery = deliveries.filter((r) => r.delivery_status === "pending" && r.delivery_type !== "automatic").length;
  const autoDeliveryFailed = deliveries.filter((r) => r.delivery_status === "failed" && r.delivery_type === "automatic").length;
  const inventoryShortage = deliveries.filter((r) => String(r.failure_reason ?? "").includes("库存")).length;

  const callbackFailed = callbacksRes.rows.filter((r) => {
    const sig = String(r.signature_result ?? "").toLowerCase();
    const proc = String(r.process_result ?? "").toLowerCase();
    return sig === "invalid" || sig === "failed" || proc === "failed" || proc === "error";
  }).length;

  const reconciliationFailed = reconciliationsRes.rows.filter((r) => {
    const res = String(r.result ?? "").toLowerCase();
    const rec = String(r.recovery_status ?? "").toLowerCase();
    return res === "mismatched" || res === "query_failed" || rec === "failed";
  }).length;

  const pendingRecharges = pendingRechargesRes.rows.filter((r) =>
    requiresRechargeAdminAttention(r)
  ).length;

  const pendingTickets = ticketCounts.processing;
  const resolvedTickets = ticketCounts.completed;

  const payload: DashboardFastSummaryPayload = {
    cachedAt: new Date().toISOString(),
    today: {
      payAmount,
      yesterdayPayAmount,
      rechargeAmount,
      yesterdayRechargeAmount,
      orderCount,
      yesterdayOrderCount,
      paidOrderCount,
      yesterdayPaidOrderCount,
      buyersCount: todayBuyers.size,
      uv: todayUvSet.size,
      yesterdayUv: yesterdayUvSet.size,
      pv,
      yesterdayPv,
      newUsers,
      yesterdayNewUsers,
    },
    todos: {
      pendingOrders: pendingOrdersCountRes.count ?? 0,
      manualDelivery,
      autoDeliveryFailed,
      inventoryShortage,
      paymentExceptionSessions: exceptionSessionsCountRes.count ?? 0,
      callbackFailed,
      reconciliationFailed,
      pendingRecharges,
      lowStockProducts: lowStockSingleRes.count ?? 0,
      activeProducts: activeProductsRes.count ?? 0,
      pendingTickets,
      resolvedTickets,
    },
  };

  summaryCache = { expiresAt: Date.now() + CACHE_TTL_MS, payload };

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store", "X-Dashboard-Cache": "MISS" },
  });
}
