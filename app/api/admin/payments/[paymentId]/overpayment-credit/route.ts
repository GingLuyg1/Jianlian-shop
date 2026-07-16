import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { getAuditRequestId, writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { requireApiSuperAdmin } from "@/lib/admin/api-auth";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    paymentId: string;
  };
};

function safeError(error: unknown) {
  const message = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message ?? "")
    : "";

  if (/BEP20_OVERPAYMENT_PAYMENT_NOT_FOUND/.test(message)) {
    return { status: 404, code: "BEP20_OVERPAYMENT_PAYMENT_NOT_FOUND", message: "支付记录不存在。" };
  }
  if (/BEP20_OVERPAYMENT_SUPER_ADMIN_REQUIRED/.test(message)) {
    return { status: 403, code: "BEP20_OVERPAYMENT_SUPER_ADMIN_REQUIRED", message: "仅 active 超级管理员可执行该操作。" };
  }
  if (/BEP20_OVERPAYMENT_REASON_REQUIRED/.test(message)) {
    return { status: 400, code: "BEP20_OVERPAYMENT_REASON_REQUIRED", message: "请填写 1 至 500 字的处理原因。" };
  }
  if (/BEP20_OVERPAYMENT_(?:PAYMENT_NOT_PAID|ORDER_STATUS_INVALID|MANUAL_REVIEW_NOT_APPROVED)/.test(message)) {
    return { status: 409, code: "BEP20_OVERPAYMENT_NOT_ELIGIBLE", message: "该支付尚未完成批准和入账，不能处置超额金额。" };
  }
  if (/BEP20_OVERPAYMENT_(?:AMOUNT_NOT_POSITIVE|CREDIT_ROUNDS_TO_ZERO)/.test(message)) {
    return { status: 409, code: "BEP20_OVERPAYMENT_NOT_POSITIVE", message: "该支付不存在可转入余额的超额金额。" };
  }
  if (/BEP20_OVERPAYMENT_(?:EXCHANGE_RATE_INVALID|CURRENCY_INVALID|PAYMENT_SNAPSHOT_MISMATCH|ORDER_LINK_INVALID|CHAIN_SESSION_NOT_FOUND|PROFILE_NOT_FOUND)/.test(message)) {
    return { status: 409, code: "BEP20_OVERPAYMENT_DATA_INVALID", message: "支付快照或关联数据不完整，请先核对支付记录。" };
  }
  if (/42P01|42883|PGRST202|schema cache|bep20_overpayment_dispositions|credit_bep20_overpayment_to_wallet/i.test(message)) {
    return { status: 503, code: "BEP20_OVERPAYMENT_MIGRATION_REQUIRED", message: "超额支付余额处置功能尚未初始化。" };
  }
  return { status: 500, code: "BEP20_OVERPAYMENT_CREDIT_FAILED", message: "超额金额转入余额失败，请稍后重试。" };
}

export async function POST(request: Request, { params }: RouteContext) {
  const requestId = getAuditRequestId(request, randomUUID());
  const admin = await requireApiSuperAdmin();
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!reason || reason.length > 500) {
    return NextResponse.json(
      { success: false, error: { code: "BEP20_OVERPAYMENT_REASON_REQUIRED", message: "请填写 1 至 500 字的处理原因。" }, request_id: requestId },
      { status: 400 },
    );
  }

  try {
    const { data, error } = await admin.supabase.rpc("credit_bep20_overpayment_to_wallet", {
      p_payment_id: params.paymentId,
      p_reason: reason,
      p_request_id: requestId,
    });
    if (error) throw error;

    const result = data && typeof data === "object" ? data as Record<string, unknown> : {};
    const status = String(result.result ?? "");
    if (!['credited', 'already_processed'].includes(status)) {
      throw new Error("BEP20_OVERPAYMENT_RESULT_INVALID");
    }

    return NextResponse.json({
      success: true,
      result: status,
      idempotent: status === "already_processed",
      overpaid_usdt: String(result.overpaid_usdt ?? "0"),
      exchange_rate: String(result.exchange_rate ?? "0"),
      credited_cny: String(result.credited_cny ?? "0"),
      processed_at: result.processed_at ?? null,
      request_id: requestId,
    });
  } catch (error) {
    const safe = safeError(error);
    await writeAdminAuditLog({
      request,
      requestId,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "credit_bep20_overpayment_to_wallet",
      module: "payments",
      targetType: "order_payment",
      targetId: params.paymentId,
      result: "failed",
      errorCode: safe.code,
      errorMessage: safe.message,
      metadata: { reason },
    });
    return NextResponse.json(
      { success: false, error: { code: safe.code, message: safe.message }, request_id: requestId },
      { status: safe.status },
    );
  }
}
