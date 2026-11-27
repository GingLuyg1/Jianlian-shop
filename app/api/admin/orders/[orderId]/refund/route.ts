import { NextResponse } from "next/server";

import { requireApiSuperAdmin } from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { checkRateLimit, getAdminRateLimitKey } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: { orderId: string };
};

function mapDirectRefundError(rawMessage: string): { message: string; status: number } {
  const msg = rawMessage || "";
  if (msg.includes("REFUND_ADMIN_PERMISSION_DENIED")) return { message: "无退款操作权限。", status: 403 };
  if (msg.includes("REFUND_REASON_REQUIRED")) return { message: "请填写退款原因。", status: 400 };
  if (msg.includes("REFUND_ORDER_NOT_FOUND")) return { message: "订单不存在。", status: 404 };
  if (msg.includes("REFUND_ORDER_NOT_PAID")) return { message: "仅已支付订单可发起退款。", status: 400 };
  if (msg.includes("REFUND_ORDER_NO_USER_ACCOUNT")) return { message: "该订单未关联用户账户，无法退回账户余额。", status: 400 };
  if (msg.includes("REFUND_ORDER_ALREADY_REFUNDED")) return { message: "该订单已全额退款，不可重复退款。", status: 409 };
  if (msg.includes("REFUND_AMOUNT_EXCEEDS_REFUNDABLE")) return { message: "退款金额超出当前可退余额。", status: 400 };
  if (msg.includes("REFUND_USER_PROFILE_NOT_FOUND")) return { message: "未找到订单对应的客户账户资料。", status: 404 };
  if (msg.includes("super_admin_direct_order_refund") || msg.includes("could not find the function")) {
    return { message: "订单退款数据库函数尚未初始化，请先在 Supabase SQL Editor 执行最新 Migration。", status: 503 };
  }
  return { message: "订单退款执行失败，请稍后重试。", status: 500 };
}

export async function POST(request: Request, context: RouteContext) {
  const admin = await requireApiSuperAdmin();
  if (!admin.ok) return admin.response;

  const limit = checkRateLimit("admin_write", getAdminRateLimitKey(admin.user.id, "order_direct_refund"));
  if (!limit.allowed) return limit.response!;

  const { orderId } = context.params;
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ error: "无效的订单 ID。" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    amount?: number | string | null;
    reason?: string;
    requestId?: string;
  } | null;

  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "请填写退款原因。" }, { status: 400 });
  }

  let parsedAmount: number | null = null;
  if (body?.amount !== undefined && body?.amount !== null && String(body.amount).trim() !== "") {
    const n = Number(body.amount);
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json({ error: "退款金额必须是大于 0 的有效数字。" }, { status: 400 });
    }
    parsedAmount = Number(n.toFixed(2));
  }

  const requestId =
    typeof body?.requestId === "string" && body.requestId.trim().length > 0
      ? body.requestId.trim().slice(0, 80)
      : `ADMIN-RF-${orderId}-${crypto.randomUUID().slice(0, 8)}`;

  try {
    const { data, error } = await admin.supabase.rpc("super_admin_direct_order_refund", {
      p_order_id: orderId,
      p_refund_amount: parsedAmount,
      p_reason: reason,
      p_request_id: requestId,
    });

    if (error) {
      const mapped = mapDirectRefundError(error.message ?? "");
      await writeAdminAuditLog({
        request,
        admin: { id: admin.user.id, email: admin.user.email },
        action: "order_direct_refund",
        module: "orders",
        targetType: "order",
        targetId: orderId,
        result: "failed",
        errorCode: typeof error.code === "string" ? error.code : null,
        errorMessage: mapped.message,
        metadata: { parsedAmount, reason, requestId },
      });
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }

    const resultObj = (data ?? {}) as Record<string, unknown>;
    const audit = await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "order_direct_refund",
      module: "orders",
      targetType: "order",
      targetId: orderId,
      targetLabel: typeof resultObj.order_no === "string" ? resultObj.order_no : null,
      result: "success",
      afterSummary: resultObj,
      metadata: { parsedAmount, reason, requestId },
    });

    return NextResponse.json({
      ok: true,
      result: resultObj,
      ...(audit.ok ? {} : { auditWarning: "退款已成功入账，但审计日志写入失败，请复核。" }),
    });
  } catch (err) {
    console.error("[Admin Direct Refund] unexpected error", err);
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "order_direct_refund",
      module: "orders",
      targetType: "order",
      targetId: orderId,
      result: "failed",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "退款执行异常，请稍后重试。" }, { status: 500 });
  }
}
