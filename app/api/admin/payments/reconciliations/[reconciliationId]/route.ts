import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { isUuid } from "@/lib/business/business-ids";
import { getReconciliationErrorMessage, isReconciliationSchemaMissing, normalizeReconciliationRows } from "@/lib/payments/reconciliation-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ reconciliationId: string }> };

const SELECT = "id,reconciliation_no,payment_session_id,business_type,business_id,channel_code,provider,local_status,provider_status,local_amount,provider_amount,currency,result,difference_type,error_code,error_message,checked_at,resolved_at,resolution,risk_level,provider_trade_no,local_trade_no,provider_summary,recovery_action,recovery_status,recovery_error,created_at,updated_at";
const RESOLVABLE_RESULTS = new Set(["mismatched", "query_failed", "manual_review"]);

export async function GET(request: Request, props: RouteContext) {
  const params = await props.params;
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

export async function PATCH(request: Request, props: RouteContext) {
  const params = await props.params;
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    await writeAdminAuditLog({ request, action: "resolve_payment_reconciliation", module: "payments", targetType: "payment_reconciliation", targetId: params.reconciliationId, result: "denied", errorMessage: admin.message });
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }
  const auditAdmin = { id: admin.user.id, email: admin.user.email };

  if (!isUuid(params.reconciliationId)) {
    return NextResponse.json({ error: "对账记录标识无效" }, { status: 400 });
  }

  try {
    const body = (await request.json().catch(() => null)) as { action?: string; resolution?: string } | null;
    const action = body?.action === "ignore" ? "ignore" : "resolve";
    const note = String(body?.resolution ?? "").trim().slice(0, 300);
    if (!note) {
      return NextResponse.json({ error: "请填写人工复核处理说明" }, { status: 400 });
    }

    const { data: existing, error: readError } = await admin.supabase
      .from("payment_reconciliations")
      .select("id,reconciliation_no,result,resolution")
      .eq("id", params.reconciliationId)
      .maybeSingle();
    if (readError) throw readError;
    if (!existing) {
      return NextResponse.json({ error: "对账记录不存在" }, { status: 404 });
    }

    const currentResult = String((existing as { result?: string | null }).result ?? "");
    if (!RESOLVABLE_RESULTS.has(currentResult)) {
      return NextResponse.json({ error: "当前对账记录已处理或无需人工复核" }, { status: 409 });
    }

    const nowIso = new Date().toISOString();
    const formattedResolution = action === "ignore" ? `[已忽略] ${note}` : `[人工已处理] ${note}`;
    const { data: updated, error: updateError } = await admin.supabase
      .from("payment_reconciliations")
      .update({
        result: "resolved",
        resolved_at: nowIso,
        resolution: formattedResolution,
        recovery_action: action === "ignore" ? "manual_ignore" : "manual_resolve",
        recovery_status: "completed",
        updated_at: nowIso,
      })
      .eq("id", params.reconciliationId)
      .select(SELECT)
      .maybeSingle();

    if (updateError) throw updateError;
    const reconciliation = updated
      ? normalizeReconciliationRows([updated as Record<string, unknown>])[0]
      : null;

    await writeAdminAuditLog({
      request,
      admin: auditAdmin,
      action: "resolve_payment_reconciliation",
      module: "payments",
      targetType: "payment_reconciliation",
      targetId: params.reconciliationId,
      targetLabel: String((existing as { reconciliation_no?: string | null }).reconciliation_no ?? params.reconciliationId),
      result: "success",
      beforeSummary: { result: currentResult },
      afterSummary: { result: "resolved", action, resolution: formattedResolution },
    });

    return NextResponse.json({ reconciliation });
  } catch (error) {
    const message = getReconciliationErrorMessage(error);
    await writeAdminAuditLog({
      request,
      admin: auditAdmin,
      action: "resolve_payment_reconciliation",
      module: "payments",
      targetType: "payment_reconciliation",
      targetId: params.reconciliationId,
      result: "failed",
      errorMessage: message,
    });
    return NextResponse.json({ error: message }, { status: isReconciliationSchemaMissing(error) ? 503 : 500 });
  }
}
