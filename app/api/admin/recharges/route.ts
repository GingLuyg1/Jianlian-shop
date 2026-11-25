import { NextResponse } from "next/server";

import { getServerAdminContext } from "@/lib/auth/require-admin";
import {
  adminRechargeSelect,
  filterPaymentRecords,
  isPaymentSchemaMissing,
  normalizeRechargeRow,
  sanitizePaymentError,
  sortPaymentRecords,
} from "@/lib/payments/admin-payment-queries";
import { requiresRechargeAdminAttention } from "@/lib/recharges/admin-attention";
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
    businessType: "recharge",
    channel: searchParams.get("channel") ?? "all",
    status: searchParams.get("status") ?? "all",
    startDate: searchParams.get("startDate") ?? "",
    endDate: searchParams.get("endDate") ?? "",
    sort: searchParams.get("sort") ?? "created_desc",
    rechargeOnly: true,
  };
  const reviewOnly = searchParams.get("view") === "review";
  const startBounds = filters.startDate ? getShanghaiDayBoundsIso(filters.startDate) : null;
  const endBounds = filters.endDate ? getShanghaiDayBoundsIso(filters.endDate) : null;
  const ascending = filters.sort === "created_asc";

  try {
    const result = await selectAllPaginated<Record<string, unknown>>(
      (from, to) => {
        let q = admin.supabase
          .from("account_recharges")
          .select(adminRechargeSelect)
          .order("created_at", { ascending });
        if (startBounds) q = q.gte("created_at", startBounds.startIso);
        if (endBounds) q = q.lte("created_at", endBounds.endIso);
        return q.range(from, to) as unknown as PromiseLike<{
          data: Record<string, unknown>[] | null;
          error: { code?: string; message?: string } | null;
        }>;
      },
      { pageSize: POSTGREST_PAGE_SIZE, maxRows: 10000 }
    );
    if (result.error) throw result.error;
    const sourceRows = result.rows;
    const rows = (reviewOnly
      ? sourceRows.filter(requiresRechargeAdminAttention)
      : sourceRows
    ).map(normalizeRechargeRow);
    const filtered = sortPaymentRecords(filterPaymentRecords(rows, filters), filters.sort);
    const from = (page - 1) * pageSize;
    return NextResponse.json({ payments: filtered.slice(from, from + pageSize), count: filtered.length });
  } catch (error) {
    return NextResponse.json({ error: sanitizePaymentError(error) }, { status: isPaymentSchemaMissing(error) ? 503 : 500 });
  }
}
