import { NextResponse } from "next/server";

import { getServerAdminContext } from "@/lib/auth/require-admin";
import {
  adminOrderPaymentSelect,
  adminRechargeSelect,
  filterPaymentRecords,
  isPaymentSchemaMissing,
  normalizeOrderPaymentRow,
  normalizeRechargeRow,
  sanitizePaymentError,
  sortPaymentRecords,
} from "@/lib/payments/admin-payment-queries";
import type { AdminPaymentRecord } from "@/lib/payments/admin-payment-types";
import { getShanghaiDayBoundsIso, POSTGREST_PAGE_SIZE, selectAllPaginated } from "@/lib/supabase/paginated-select";

export const dynamic = "force-dynamic";

function parsePositiveInt(raw: string | null, fallback: number, min: number, max: number) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export async function GET(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  const { searchParams } = new URL(request.url);
  const page = parsePositiveInt(searchParams.get("page"), 1, 1, 10000);
  const pageSize = parsePositiveInt(searchParams.get("pageSize"), 20, 10, 100);
  const filters = {
    search: searchParams.get("search") ?? "",
    businessType: searchParams.get("businessType") ?? "all",
    channel: searchParams.get("channel") ?? "all",
    status: searchParams.get("status") ?? "all",
    startDate: searchParams.get("startDate") ?? "",
    endDate: searchParams.get("endDate") ?? "",
    sort: searchParams.get("sort") ?? "created_desc",
    view: searchParams.get("view") ?? "all",
    exceptionType: searchParams.get("exceptionType") ?? "all",
  };

  const startBounds = filters.startDate ? getShanghaiDayBoundsIso(filters.startDate) : null;
  const endBounds = filters.endDate ? getShanghaiDayBoundsIso(filters.endDate) : null;
  const wantOrders = filters.businessType === "all" || filters.businessType === "order";
  const wantRecharges = filters.businessType === "all" || filters.businessType === "recharge";
  const ascending = filters.sort === "created_asc";

  try {
    const [orderResult, rechargeResult] = await Promise.all([
      wantOrders
        ? selectAllPaginated<Record<string, unknown>>(
            (from, to) => {
              let q = admin.supabase
                .from("order_payments")
                .select(adminOrderPaymentSelect)
                .order("created_at", { ascending });
              if (startBounds) q = q.gte("created_at", startBounds.startIso);
              if (endBounds) q = q.lte("created_at", endBounds.endIso);
              if (filters.view === "exceptions") q = q.not("exception_type", "is", null);
              if (filters.exceptionType && filters.exceptionType !== "all") {
                q = q.eq("exception_type", filters.exceptionType);
              }
              return q.range(from, to) as unknown as PromiseLike<{
                data: Record<string, unknown>[] | null;
                error: { code?: string; message?: string } | null;
              }>;
            },
            { pageSize: POSTGREST_PAGE_SIZE, maxRows: 10000 }
          )
        : Promise.resolve({ rows: [] as Record<string, unknown>[], error: null, totalCount: 0, truncated: false, queryCount: 0 }),
      wantRecharges
        ? selectAllPaginated<Record<string, unknown>>(
            (from, to) => {
              let q = admin.supabase
                .from("account_recharges")
                .select(adminRechargeSelect)
                .order("created_at", { ascending });
              if (startBounds) q = q.gte("created_at", startBounds.startIso);
              if (endBounds) q = q.lte("created_at", endBounds.endIso);
              if (filters.view === "exceptions") q = q.not("exception_type", "is", null);
              if (filters.exceptionType && filters.exceptionType !== "all") {
                q = q.eq("exception_type", filters.exceptionType);
              }
              return q.range(from, to) as unknown as PromiseLike<{
                data: Record<string, unknown>[] | null;
                error: { code?: string; message?: string } | null;
              }>;
            },
            { pageSize: POSTGREST_PAGE_SIZE, maxRows: 10000 }
          )
        : Promise.resolve({ rows: [] as Record<string, unknown>[], error: null, totalCount: 0, truncated: false, queryCount: 0 }),
    ]);

    if (orderResult.error) throw orderResult.error;
    if (rechargeResult.error && !isPaymentSchemaMissing(rechargeResult.error)) throw rechargeResult.error;

    const rows: AdminPaymentRecord[] = [
      ...orderResult.rows.map(normalizeOrderPaymentRow),
      ...rechargeResult.rows.map(normalizeRechargeRow),
    ];
    const filtered = sortPaymentRecords(filterPaymentRecords(rows, filters), filters.sort);
    const from = (page - 1) * pageSize;
    const payments = filtered.slice(from, from + pageSize);

    return NextResponse.json({ payments, count: filtered.length });
  } catch (error) {
    return NextResponse.json({ error: sanitizePaymentError(error) }, { status: isPaymentSchemaMissing(error) ? 503 : 500 });
  }
}
