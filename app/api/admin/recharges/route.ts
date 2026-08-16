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

const ACTIVE_REVIEW_STATUSES = new Set(["submitted", "reviewing", "approved", "failed"]);
const COMPLETED_RECHARGE_STATUSES = new Set(["paid", "succeeded"]);

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function requiresRechargeAdminAttention(row: Record<string, unknown>) {
  const status = String(row.status ?? "").trim().toLowerCase();
  if (COMPLETED_RECHARGE_STATUSES.has(status)) return false;
  if (ACTIVE_REVIEW_STATUSES.has(status)) return true;

  const hasExceptionEvidence = hasText(row.exception_type) || hasText(row.error_summary);
  if (["pending", "waiting_payment"].includes(status)) return hasExceptionEvidence;

  const isManualFlow = String(row.review_mode ?? "").trim().toLowerCase() === "manual";
  const isClosedWithoutAdminAction = ["rejected", "cancelled", "expired"].includes(status);
  return hasExceptionEvidence || (isManualFlow && !isClosedWithoutAdminAction);
}

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
  const reviewOnly = searchParams.get("view") === "review";

  try {
    const { data, error } = await admin.supabase.from("account_recharges").select(`${adminRechargeSelect},review_mode`).limit(1000);
    if (error) throw error;
    const sourceRows = (data ?? []) as Record<string, unknown>[];
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
