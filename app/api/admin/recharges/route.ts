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

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") || 20)));
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

  try {
    const { data, error } = await admin.supabase.from("account_recharges").select(adminRechargeSelect).limit(1000);
    if (error) throw error;
    const rows = ((data ?? []) as Record<string, unknown>[]).map(normalizeRechargeRow);
    const filtered = sortPaymentRecords(filterPaymentRecords(rows, filters), filters.sort);
    const from = (page - 1) * pageSize;
    return NextResponse.json({ payments: filtered.slice(from, from + pageSize), count: filtered.length });
  } catch (error) {
    return NextResponse.json({ error: sanitizePaymentError(error) }, { status: isPaymentSchemaMissing(error) ? 503 : 500 });
  }
}
