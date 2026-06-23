import { NextResponse } from "next/server";

import { getServerAdminContext } from "@/lib/auth/require-admin";
import {
  RECONCILIATION_DIFFERENCE_TYPES,
  RECONCILIATION_RESULTS,
  getReconciliationErrorMessage,
  isReconciliationSchemaMissing,
  normalizeReconciliationRows,
} from "@/lib/payments/reconciliation-service";

export const dynamic = "force-dynamic";

const SELECT = "id,reconciliation_no,payment_session_id,business_type,business_id,channel_code,provider,local_status,provider_status,local_amount,provider_amount,currency,result,difference_type,error_code,error_message,checked_at,resolved_at,resolution,risk_level,provider_trade_no,local_trade_no,provider_summary,recovery_action,recovery_status,recovery_error,created_at,updated_at";

export async function GET(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") || 20)));
  const search = (searchParams.get("search") ?? "").trim();
  const result = searchParams.get("result") ?? "all";
  const differenceType = searchParams.get("differenceType") ?? "all";
  const from = (page - 1) * pageSize;

  try {
    let query = admin.supabase.from("payment_reconciliations").select(SELECT, { count: "exact" }).order("checked_at", { ascending: false });
    if (RECONCILIATION_RESULTS.includes(result as any)) query = query.eq("result", result);
    if (RECONCILIATION_DIFFERENCE_TYPES.includes(differenceType as any)) query = query.eq("difference_type", differenceType);
    if (search) {
      query = query.or(`reconciliation_no.ilike.%${search}%,business_id.ilike.%${search}%,channel_code.ilike.%${search}%`);
    }
    const { data, error, count } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    return NextResponse.json({ reconciliations: normalizeReconciliationRows((data ?? []) as Record<string, unknown>[]), count: count ?? 0 });
  } catch (error) {
    return NextResponse.json({ error: getReconciliationErrorMessage(error) }, { status: isReconciliationSchemaMissing(error) ? 503 : 500 });
  }
}
