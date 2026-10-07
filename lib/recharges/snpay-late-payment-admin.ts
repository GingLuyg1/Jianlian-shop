import "server-only";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { approveSnpayLatePayment } from "@/lib/recharges/snpay-late-payment-service";
import { validateLatePaymentReason } from "@/lib/recharges/snpay-late-payment-policy.mjs";

export async function handleSnpayLatePaymentApproval(
  request: Request, rechargeId: string, admin: { id: string; email?: string | null }, reasonInput: unknown,
) {
  const requestId = randomUUID();
  let reason = "";
  let creditMayHaveCommitted = false;
  try {
    reason = validateLatePaymentReason(reasonInput);
    const intent = await writeAdminAuditLog({
      request, admin, action: "recharge_approve_late_payment", module: "recharges",
      targetType: "account_recharge", targetId: rechargeId, requestId, result: "success",
      metadata: { phase: "approval_intent", reason, creditExecuted: false },
    });
    if (!intent.ok) throw new Error("audit_required");
    const result = await approveSnpayLatePayment({ rechargeId, adminId: admin.id, reason, requestId });
    creditMayHaveCommitted = true;
    const audit = await writeAdminAuditLog({
      request, admin, action: "recharge_approve_late_payment", module: "recharges",
      targetType: "account_recharge", targetId: rechargeId, requestId, result: "success",
      metadata: { phase: "completion", ...result.evidence, reason, idempotent: result.idempotent },
    });
    if (!audit.ok) throw new Error("completion_audit_unavailable");
    return NextResponse.json({
      code: "RECHARGE_REVIEW_COMPLETED", requestId, idempotent: result.idempotent,
      outcome: result.idempotent ? "idempotent" : "completed", requiresManualReconciliation: false,
      safeMessage: result.idempotent ? "该笔过期付款已人工完成，未重复入账。" : "平台核验通过，已人工入账本金。",
    });
  } catch (error) {
    const code = String((error as { code?: unknown })?.code ?? "");
    const safeCode = /^LATE_PAYMENT_[A-Z_]+$/.test(code) ? code : "LATE_PAYMENT_AUDIT_REQUIRED";
    const uncertain = creditMayHaveCommitted || safeCode === "LATE_PAYMENT_RPC_OUTCOME_REQUIRES_RECONCILIATION";
    await writeAdminAuditLog({
      request, admin, action: "recharge_approve_late_payment", module: "recharges",
      targetType: "account_recharge", targetId: rechargeId, requestId,
      result: uncertain ? "partial" : "failed", errorCode: safeCode,
      errorMessage: "请人工核对本笔充值及账本，禁止盲目重试。",
      metadata: { phase: "failed", outcome: uncertain ? "uncertain" : "failed" },
    }).catch(() => undefined);
    return NextResponse.json({
      code: safeCode, requestId, outcome: uncertain ? "uncertain" : "failed", idempotent: false,
      requiresManualReconciliation: true,
      safeMessage: "过期付款核验或入账未获确认，请人工核对；不得重复入账。",
    }, { status: 409 });
  }
}
