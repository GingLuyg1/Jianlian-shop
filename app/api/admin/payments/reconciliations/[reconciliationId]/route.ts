import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { getReconciliationErrorMessage, isReconciliationSchemaMissing, normalizeReconciliationRows } from "@/lib/payments/reconciliation-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: { reconciliationId: string } };

const SELECT = "id,reconciliation_no,payment_session_id,business_type,business_id,channel_code,provider,local_status,provider_status,local_amount,provider_amount,currency,result,difference_type,error_code,error_message,checked_at,resolved_at,resolution,risk_level,provider_trade_no,local_trade_no,provider_summary,recovery_action,recovery_status,recovery_error,created_at,updated_at";

export async function GET(request: Request, { params }: RouteContext) {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    await writeAdminAuditLog({ request, action: "view_payment_reconciliation", module: "payments", targetType: "payment_reconciliation", targetId: params.reconciliationId, result: "denied", errorMessage: admin.message });
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  try {
    const { data, error } = await admin.supabase.from("payment_reconciliations").select(SELECT).eq("id", params.reconciliationId).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "对账记录不存在" }, { status: 404 });
    const reconciliation = normalizeReconciliationRows([data as Record<string, unknown>])[0];
    await writeAdminAuditLog({ request, admin: { id: admin.user.id, email: admin.user.email }, action: "view_payment_reconciliation", module: "payments", targetType: "payment_reconciliation", targetId: params.reconciliationId, targetLabel: reconciliation.reconciliation_no, result: "success" });
    return NextResponse.json({ reconciliation });
  } catch (error) {
    return NextResponse.json({ error: getReconciliationErrorMessage(error) }, { status: isReconciliationSchemaMissing(error) ? 503 : 500 });
  }
}
