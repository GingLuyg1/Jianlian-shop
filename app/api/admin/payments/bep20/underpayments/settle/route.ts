import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerSuperAdminContext } from "@/lib/auth/require-admin";
import { getAdminBep20UnderpaymentPreview } from "@/lib/payments/bep20-underpayment-admin";
import {
  mapAdminUnderpaymentAuthorizationFailure,
  mapAdminUnderpaymentSettlementError,
  parseAdminUnderpaymentSettlementBody,
} from "@/lib/payments/bep20-underpayment-admin-runtime.mjs";
import {
  getBep20UnderpaymentRequiredConfirmations,
  settleBep20Underpayment,
} from "@/lib/payments/bep20-underpayment-service";
import { Bep20UnderpaymentRuntimeError } from "@/lib/payments/bep20-underpayment-runtime.mjs";
import { checkRateLimit, checkRequestSize, getAdminRateLimitKey } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

function jsonFailure(code: string, message: string, status: number, headers?: Headers) {
  return NextResponse.json({ success: false, code, message }, { status, headers });
}

function logSettlementAction(input: {
  requestId: string;
  sessionId: string;
  operatorId: string;
  result: string;
  durationMs: number;
}) {
  console.info("[BEP20 underpayment admin]", {
    request_id: input.requestId,
    session_id: input.sessionId,
    operator_id: input.operatorId,
    action: "settle",
    result: input.result,
    duration_ms: input.durationMs,
  });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const admin = await getServerSuperAdminContext();
  if (!admin.ok) {
    await writeAdminAuditLog({
      request,
      action: "settle_bep20_underpayment_to_wallet",
      module: "payments",
      targetType: "chain_payment_session",
      result: "denied",
      errorMessage: admin.message,
    });
    const safe = mapAdminUnderpaymentAuthorizationFailure(admin.status, admin.message);
    return jsonFailure(safe.code, safe.message, safe.status);
  }

  const rateLimit = checkRateLimit(
    "admin_write",
    getAdminRateLimitKey(admin.user.id, "bep20_underpayment_settlement"),
  );
  if (!rateLimit.allowed) {
    return jsonFailure(
      "RATE_LIMITED",
      "请求过于频繁，请稍后重试。",
      rateLimit.response?.status ?? 429,
      rateLimit.response?.headers,
    );
  }

  const sizeError = checkRequestSize(request, 8 * 1024);
  if (sizeError) {
    return jsonFailure("REQUEST_TOO_LARGE", "请求体过大。", sizeError.status || 413);
  }

  const parsed = parseAdminUnderpaymentSettlementBody(await request.json().catch(() => null));
  if (!parsed.ok || !parsed.value) {
    return jsonFailure(
      parsed.code ?? "BEP20_UNDERPAYMENT_INPUT_INVALID",
      parsed.message ?? "欠额支付结算请求无效。",
      parsed.status ?? 400,
    );
  }
  const {
    sessionId,
    reason,
    requestId,
    requiredConfirmations,
    confirmationText,
    confirmIrreversible,
  } = parsed.value;

  let configuredConfirmations: number;
  try {
    configuredConfirmations = getBep20UnderpaymentRequiredConfirmations();
  } catch {
    const safe = mapAdminUnderpaymentSettlementError(
      "BEP20_UNDERPAYMENT_CONFIRMATION_CONFIG_INVALID",
    );
    return jsonFailure(safe.code, safe.message, safe.status);
  }
  if (requiredConfirmations !== configuredConfirmations) {
    return jsonFailure(
      "BEP20_UNDERPAYMENT_CONFIRMATION_MISMATCH",
      "确认数与服务端安全配置不一致，请刷新预检查。",
      409,
    );
  }

  let preview;
  try {
    preview = await getAdminBep20UnderpaymentPreview(sessionId);
  } catch {
    return jsonFailure(
      "BEP20_UNDERPAYMENT_PREVIEW_FAILED",
      "结算前预检查失败，请刷新后重试。",
      503,
    );
  }
  if (!preview) {
    return jsonFailure("BEP20_UNDERPAYMENT_SESSION_NOT_FOUND", "欠额支付记录不存在。", 404);
  }
  if (confirmationText !== preview.orderNo) {
    return jsonFailure(
      "BEP20_UNDERPAYMENT_CONFIRMATION_TEXT_INVALID",
      "请输入完整订单号确认本次不可撤销操作。",
      400,
    );
  }
  if (!preview.manualEligible && preview.idempotencyState !== "already_settled") {
    return jsonFailure(
      "BEP20_UNDERPAYMENT_PRECHECK_BLOCKED",
      "当前记录未通过只读预检查，请刷新后核对阻断原因。",
      409,
    );
  }
  if (!confirmIrreversible) {
    const safe = mapAdminUnderpaymentSettlementError(
      "BEP20_UNDERPAYMENT_IRREVERSIBLE_CONFIRMATION_REQUIRED",
    );
    return jsonFailure(safe.code, safe.message, safe.status);
  }

  try {
    // The server-authenticated operator always overrides any client-supplied identity.
    const result = await settleBep20Underpayment(sessionId, {
      source: "manual_admin",
      operatorId: admin.user.id,
      irreversibleConfirmed: true,
      reason,
      requestId,
    });

    if (result.ok) {
      const resultName = result.idempotent ? "already_settled" : "settled";
      logSettlementAction({
        requestId,
        sessionId,
        operatorId: admin.user.id,
        result: resultName,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({
        success: true,
        dry_run: false,
        result: resultName,
        idempotent: Boolean(result.idempotent),
        settlement: result,
      });
    }

    const safe = mapAdminUnderpaymentSettlementError(result.code);
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "settle_bep20_underpayment_to_wallet",
      module: "payments",
      targetType: "chain_payment_session",
      targetId: sessionId,
      result: "failed",
      errorCode: safe.code,
      errorMessage: safe.message,
      metadata: { settlement_source: "manual_admin", request_id: result.requestId },
    });
    logSettlementAction({
      requestId,
      sessionId,
      operatorId: admin.user.id,
      result: safe.code,
      durationMs: Date.now() - startedAt,
    });
    return jsonFailure(safe.code, safe.message, safe.status);
  } catch (error) {
    const code = error instanceof Bep20UnderpaymentRuntimeError
      ? error.code
      : "BEP20_UNDERPAYMENT_SETTLEMENT_FAILED";
    const safe = mapAdminUnderpaymentSettlementError(code);
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "settle_bep20_underpayment_to_wallet",
      module: "payments",
      targetType: "chain_payment_session",
      targetId: sessionId,
      result: "failed",
      errorCode: safe.code,
      errorMessage: safe.message,
      metadata: { settlement_source: "manual_admin" },
    });
    logSettlementAction({
      requestId,
      sessionId,
      operatorId: admin.user.id,
      result: safe.code,
      durationMs: Date.now() - startedAt,
    });
    return jsonFailure(safe.code, safe.message, safe.status);
  }
}
