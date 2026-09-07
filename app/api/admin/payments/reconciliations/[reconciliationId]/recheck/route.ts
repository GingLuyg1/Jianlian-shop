import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { isUuid } from "@/lib/business/business-ids";
import { sanitizePaymentError } from "@/lib/payments/admin-payment-queries";
import { runPaymentReconciliation } from "@/lib/payments/reconciliation-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: { reconciliationId: string } };

const RECHECKABLE_RESULTS = new Set(["mismatched", "query_failed", "manual_review"]);

function safeRecheckResult(result: Awaited<ReturnType<typeof runPaymentReconciliation>>) {
  return {
    processed: result.processed,
    matched: result.matched,
    mismatched: result.mismatched,
    pending: result.pending,
    query_failed: result.query_failed,
    manual_review: result.manual_review,
    resolved: result.resolved,
    skipped: result.skipped,
    errors: result.errors.slice(0, 20).map((entry) => ({
      paymentSessionId: entry.paymentSessionId,
      message: "支付对账处理失败，请查看对账记录或操作日志。",
    })),
  };
}

export async function POST(request: Request, { params }: RouteContext) {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    await writeAdminAuditLog({ request, action: "recheck_payment_reconciliation", module: "payments", targetType: "payment_reconciliation", targetId: params.reconciliationId, result: "denied", errorMessage: admin.message });
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }
  const auditAdmin = { id: admin.user.id, email: admin.user.email };

  if (!isUuid(params.reconciliationId)) {
    const message = "对账记录标识无效";
    await writeAdminAuditLog({ request, admin: auditAdmin, action: "recheck_payment_reconciliation", module: "payments", targetType: "payment_reconciliation", targetId: params.reconciliationId, result: "failed", errorCode: "invalid_reconciliation_id", errorMessage: message });
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const { data, error } = await admin.supabase.from("payment_reconciliations").select("id,payment_session_id,business_type,reconciliation_no,provider,result").eq("id", params.reconciliationId).maybeSingle();
    if (error) throw error;
    if (!data) {
      const message = "对账记录不存在";
      await writeAdminAuditLog({ request, admin: auditAdmin, action: "recheck_payment_reconciliation", module: "payments", targetType: "payment_reconciliation", targetId: params.reconciliationId, result: "failed", errorCode: "reconciliation_not_found", errorMessage: message });
      return NextResponse.json({ error: message }, { status: 404 });
    }
    const row = data as { payment_session_id?: string | null; business_type?: "order" | "recharge"; reconciliation_no?: string; provider?: string | null; result?: string | null };
    if (!RECHECKABLE_RESULTS.has(String(row.result ?? ""))) {
      const message = "当前对账状态不允许重新检查";
      await writeAdminAuditLog({ request, admin: auditAdmin, action: "recheck_payment_reconciliation", module: "payments", targetType: "payment_reconciliation", targetId: params.reconciliationId, targetLabel: row.reconciliation_no, result: "failed", errorCode: "recheck_status_not_allowed", errorMessage: message, beforeSummary: { result: row.result ?? null } });
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (!row.payment_session_id || !row.provider || (row.business_type !== "order" && row.business_type !== "recharge")) {
      const message = !row.payment_session_id
        ? "对账记录缺少支付会话，无法重新检查"
        : !row.provider
          ? "Provider 未配置，无法重新检查"
          : "对账记录业务类型无效，无法重新检查";
      await writeAdminAuditLog({ request, admin: auditAdmin, action: "recheck_payment_reconciliation", module: "payments", targetType: "payment_reconciliation", targetId: params.reconciliationId, targetLabel: row.reconciliation_no, result: "failed", errorCode: "recheck_record_invalid", errorMessage: message, beforeSummary: { result: row.result ?? null } });
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const result = await runPaymentReconciliation({ paymentSessionId: row.payment_session_id, businessType: row.business_type, batchSize: 1, reason: "admin_recheck" }, admin.supabase);
    const safeResult = safeRecheckResult(result);
    await writeAdminAuditLog({
      request,
      admin: auditAdmin,
      action: "recheck_payment_reconciliation",
      module: "payments",
      targetType: "payment_reconciliation",
      targetId: params.reconciliationId,
      targetLabel: row.reconciliation_no,
      result: result.errors.length ? "failed" : "success",
      errorMessage: result.errors.length ? "支付对账处理失败，请查看对账记录或操作日志。" : null,
      beforeSummary: { result: row.result ?? null },
      afterSummary: { processed: safeResult.processed, matched: safeResult.matched, mismatched: safeResult.mismatched, query_failed: safeResult.query_failed, manual_review: safeResult.manual_review, resolved: safeResult.resolved, error_count: safeResult.errors.length },
    });
    return NextResponse.json({ result: safeResult });
  } catch (error) {
    const message = sanitizePaymentError(error, "重新检查失败，请稍后重试");
    await writeAdminAuditLog({ request, admin: auditAdmin, action: "recheck_payment_reconciliation", module: "payments", targetType: "payment_reconciliation", targetId: params.reconciliationId, result: "failed", errorMessage: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
