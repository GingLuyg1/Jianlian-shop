import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerSuperAdminContext } from "@/lib/auth/require-admin";
import { isUuid } from "@/lib/business/business-ids";
import { getAdminBep20UnderpaymentPreview } from "@/lib/payments/bep20-underpayment-admin";
import {
  getBep20UnderpaymentRequiredConfirmations,
  settleBep20Underpayment,
} from "@/lib/payments/bep20-underpayment-service";
import {
  Bep20UnderpaymentRuntimeError,
  isBep20UnderpaymentIrreversibleConfirmation,
} from "@/lib/payments/bep20-underpayment-runtime.mjs";
import { checkRateLimit, checkRequestSize, getAdminRateLimitKey } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

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

function safeSettlementError(code: string) {
  if (/^(PGRST202|PGRST205|42P01|42883)$/.test(code)) {
    return { status: 503, code: "BEP20_UNDERPAYMENT_MIGRATION_REQUIRED", message: "欠额支付结算功能尚未初始化。" };
  }
  if ([
    "BEP20_UNDERPAYMENT_SERVICE_ROLE_NOT_CONFIGURED",
    "BEP20_UNDERPAYMENT_SERVICE_ROLE_REQUIRED",
    "BEP20_UNDERPAYMENT_CONFIRMATION_CONFIG_INVALID",
  ].includes(code)) {
    return { status: 503, code, message: "欠额支付结算服务配置不可用。" };
  }
  if (code === "BEP20_UNDERPAYMENT_SESSION_NOT_FOUND") {
    return { status: 404, code, message: "链上支付会话不存在。" };
  }
  if (["22P02", "SESSION_ID_REQUIRED", "BEP20_UNDERPAYMENT_INPUT_INVALID"].includes(code)) {
    return { status: 400, code, message: "欠额支付结算请求无效。" };
  }
  if (code === "BEP20_UNDERPAYMENT_IRREVERSIBLE_CONFIRMATION_REQUIRED") {
    return { status: 400, code, message: "人工结算前必须明确确认该操作不可撤销。" };
  }
  if (
    code === "BEP20_UNDERPAYMENT_DEADLINE_INVALID"
    || /^BEP20_UNDERPAYMENT_(?:NOT_EXPIRED|STATE_INVALID|PAYMENT_STATE_INVALID|SNAPSHOT_INVALID|ORDER_SNAPSHOT_MISMATCH|PAYMENT_SNAPSHOT_MISMATCH|OWNERSHIP_INVALID|CLAIM_INVALID|TRANSFER_COUNT_INVALID|TRANSFER_INVALID|TRANSACTION_REFERENCE_MISMATCH|LATE_TRANSFER|RAW_AMOUNT_INVALID|AMOUNT_MISMATCH|AUTOMATIC_OPERATOR_FORBIDDEN|SUPER_ADMIN_REQUIRED|PROFILE_NOT_FOUND|CREDIT_ROUNDS_TO_ZERO|BALANCE_OUT_OF_RANGE|ORDER_STATE_CHANGED|PAYMENT_LINK_LOST)$/.test(code)
  ) {
    return { status: 409, code, message: "当前欠额支付状态不允许结算，请刷新后核对。" };
  }
  if (code === "BEP20_UNDERPAYMENT_INVENTORY_RELEASE_FAILED") {
    return { status: 503, code, message: "库存释放暂时不可用，欠额结算未生效，请稍后重试。" };
  }
  if (code === "BEP20_UNDERPAYMENT_RESULT_INVALID") {
    return { status: 500, code, message: "欠额支付结算返回异常，请稍后重试。" };
  }
  return { status: 500, code: "BEP20_UNDERPAYMENT_SETTLEMENT_FAILED", message: "欠额支付结算失败，请稍后重试。" };
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
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const rateLimit = checkRateLimit(
    "admin_write",
    getAdminRateLimitKey(admin.user.id, "bep20_underpayment_settlement"),
  );
  if (!rateLimit.allowed) return rateLimit.response!;

  const sizeError = checkRequestSize(request, 8 * 1024);
  if (sizeError) return sizeError;

  const body = await request.json().catch(() => null) as {
    action?: string;
    dryRun?: boolean;
    dry_run?: boolean;
    sessionId?: string;
    reason?: string;
    requestId?: string;
    requiredConfirmations?: number;
    confirmIrreversible?: boolean;
    confirmationText?: string;
  } | null;
  const action = String(body?.action ?? "").trim();
  const sessionId = String(body?.sessionId ?? "").trim();
  const reason = String(body?.reason ?? "").trim();
  const requestId = String(body?.requestId ?? "").trim();
  const requiredConfirmations = Number(body?.requiredConfirmations);
  const explicitlyWrites = body?.dryRun === false || body?.dry_run === false;
  if (action !== "settle" || !explicitlyWrites) {
    return NextResponse.json(
      { success: false, code: "BEP20_UNDERPAYMENT_EXPLICIT_SETTLEMENT_REQUIRED", message: "真实结算必须明确声明操作类型。" },
      { status: 400 },
    );
  }
  if (
    !isUuid(sessionId)
    || reason.length < 1
    || reason.length > 500
    || requestId.length < 1
    || requestId.length > 200
    || !Number.isInteger(requiredConfirmations)
    || requiredConfirmations < 1
    || requiredConfirmations > 1000
  ) {
    return NextResponse.json(
      { success: false, code: "BEP20_UNDERPAYMENT_INPUT_INVALID", message: "链上支付会话、处理原因、请求编号或确认数无效。" },
      { status: 400 },
    );
  }
  let configuredConfirmations: number;
  try {
    configuredConfirmations = getBep20UnderpaymentRequiredConfirmations();
  } catch {
    const safe = safeSettlementError("BEP20_UNDERPAYMENT_CONFIRMATION_CONFIG_INVALID");
    return NextResponse.json({ success: false, code: safe.code, message: safe.message }, { status: safe.status });
  }
  if (requiredConfirmations !== configuredConfirmations) {
    return NextResponse.json(
      { success: false, code: "BEP20_UNDERPAYMENT_CONFIRMATION_MISMATCH", message: "确认数与服务端安全配置不一致，请刷新预检查。" },
      { status: 409 },
    );
  }
  let preview;
  try {
    preview = await getAdminBep20UnderpaymentPreview(sessionId);
  } catch {
    return NextResponse.json(
      { success: false, code: "BEP20_UNDERPAYMENT_PREVIEW_FAILED", message: "结算前预检查失败，请刷新后重试。" },
      { status: 503 },
    );
  }
  if (!preview) {
    return NextResponse.json(
      { success: false, code: "BEP20_UNDERPAYMENT_SESSION_NOT_FOUND", message: "欠额支付记录不存在。" },
      { status: 404 },
    );
  }
  if (String(body?.confirmationText ?? "").trim() !== preview.orderNo) {
    return NextResponse.json(
      { success: false, code: "BEP20_UNDERPAYMENT_CONFIRMATION_TEXT_INVALID", message: "请输入完整订单号确认本次不可撤销操作。" },
      { status: 400 },
    );
  }
  if (!preview.eligible && preview.idempotencyState !== "already_settled") {
    return NextResponse.json(
      { success: false, code: "BEP20_UNDERPAYMENT_PRECHECK_BLOCKED", message: "当前记录未通过只读预检查，请刷新后核对阻断原因。" },
      { status: 409 },
    );
  }
  if (!isBep20UnderpaymentIrreversibleConfirmation(body?.confirmIrreversible)) {
    const safe = safeSettlementError("BEP20_UNDERPAYMENT_IRREVERSIBLE_CONFIRMATION_REQUIRED");
    return NextResponse.json({ success: false, message: safe.message, code: safe.code }, { status: safe.status });
  }

  try {
    // The service-role client is obtained only inside the server settlement
    // service after cookie authentication and super-admin authorization pass.
    const result = await settleBep20Underpayment(sessionId, {
      source: "manual_admin",
      operatorId: admin.user.id,
      irreversibleConfirmed: true,
      reason,
      requestId: requestId || undefined,
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

    const safe = safeSettlementError(result.code);
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
    return NextResponse.json({ success: false, message: safe.message, code: safe.code }, { status: safe.status });
  } catch (error) {
    const code = error instanceof Bep20UnderpaymentRuntimeError
      ? error.code
      : "BEP20_UNDERPAYMENT_SETTLEMENT_FAILED";
    const safe = safeSettlementError(code);
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
    return NextResponse.json({ success: false, message: safe.message, code: safe.code }, { status: safe.status });
  }
}
