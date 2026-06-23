import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { getReconciliationErrorMessage, runPaymentReconciliation } from "@/lib/payments/reconciliation-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: { reconciliationId: string } };

export async function POST(request: Request, { params }: RouteContext) {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    await writeAdminAuditLog({ request, action: "recheck_payment_reconciliation", module: "payments", targetType: "payment_reconciliation", targetId: params.reconciliationId, result: "denied", errorMessage: admin.message });
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  try {
    const { data, error } = await admin.supabase.from("payment_reconciliations").select("id,payment_session_id,business_type,reconciliation_no,provider").eq("id", params.reconciliationId).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "对账记录不存在" }, { status: 404 });
    const row = data as { payment_session_id?: string | null; business_type?: "order" | "recharge"; reconciliation_no?: string; provider?: string | null };
    if (!row.payment_session_id) return NextResponse.json({ error: "对账记录缺少支付会话，无法重新检查" }, { status: 400 });
    if (!row.provider) return NextResponse.json({ error: "Provider 未配置，无法重新检查" }, { status: 400 });

    const result = await runPaymentReconciliation({ paymentSessionId: row.payment_session_id, businessType: row.business_type, batchSize: 1, reason: "admin_recheck" }, admin.supabase);
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "recheck_payment_reconciliation",
      module: "payments",
      targetType: "payment_reconciliation",
      targetId: params.reconciliationId,
      targetLabel: row.reconciliation_no,
      result: result.errors.length ? "failed" : "success",
      errorMessage: result.errors[0]?.message,
      metadata: { processed: result.processed, query_failed: result.query_failed, manual_review: result.manual_review },
    });
    return NextResponse.json({ result });
  } catch (error) {
    const message = getReconciliationErrorMessage(error, "重新检查失败");
    await writeAdminAuditLog({ request, admin: { id: admin.user.id, email: admin.user.email }, action: "recheck_payment_reconciliation", module: "payments", targetType: "payment_reconciliation", targetId: params.reconciliationId, result: "failed", errorMessage: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
