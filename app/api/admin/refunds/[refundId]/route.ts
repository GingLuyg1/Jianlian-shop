import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { REFUND_ACTION_LABELS, normalizeRefundError } from "@/lib/refunds/refund-utils";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const SUPER_ADMIN_EMAIL = "gac000189@gmail.com";
type RouteContext = { params: { refundId: string } };
type Row = Record<string, unknown>;

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, init);
}

async function requireSuperAdmin(request: Request) {
  const admin = await requireApiAdmin();
  if (!admin.ok) return admin;
  if (admin.user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) {
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "process_refund",
      module: "orders",
      targetType: "refund",
      result: "denied",
      errorMessage: "仅超级管理员可以处理退款售后",
    });
    return { ok: false as const, response: json({ error: "仅超级管理员可以处理退款售后。" }, { status: 403 }) };
  }
  return admin;
}

export async function GET(request: Request, context: RouteContext) {
  const admin = await requireSuperAdmin(request);
  if (!admin.ok) return admin.response;
  const supabase = getSupabaseServiceRoleClient() ?? admin.supabase;

  try {
    const { data, error } = await supabase
      .from("refund_requests")
      .select("*,orders(*,order_items(*)),profiles(email,display_name),refund_status_logs(*)")
      .eq("id", context.params.refundId)
      .maybeSingle();
    if (error) return json({ error: normalizeRefundError(error.message) }, { status: 503 });
    if (!data) return json({ error: "退款申请不存在。" }, { status: 404 });
    return json({ refund: data });
  } catch (error) {
    console.error("[Admin Refunds] detail failed", error);
    return json({ error: "退款详情读取失败，请稍后重试。" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const admin = await requireSuperAdmin(request);
  if (!admin.ok) return admin.response;
  const supabase = getSupabaseServiceRoleClient() ?? admin.supabase;

  const body = (await request.json().catch(() => null)) as
    | { action?: string; approvedAmount?: number; reviewNote?: string; userVisibleNote?: string; providerRefundId?: string; requestId?: string }
    | null;
  const action = body?.action?.trim();
  const reviewNote = body?.reviewNote?.trim();
  if (!action || !REFUND_ACTION_LABELS[action]) return json({ error: "退款操作不合法。" }, { status: 400 });
  if (!reviewNote) return json({ error: "请填写审核备注。" }, { status: 400 });

  try {
    const before = await supabase.from("refund_requests").select("id,refund_no,status,requested_amount,approved_amount,order_id,user_id").eq("id", context.params.refundId).maybeSingle();
    const { data, error } = await supabase.rpc("admin_process_refund_request", {
      p_refund_id: context.params.refundId,
      p_action: action,
      p_approved_amount: body?.approvedAmount ?? null,
      p_review_note: reviewNote,
      p_user_visible_note: body?.userVisibleNote ?? null,
      p_provider_refund_id: body?.providerRefundId ?? null,
      p_request_id: body?.requestId ?? crypto.randomUUID(),
    });

    if (error) {
      const message = normalizeRefundError(error.message);
      await writeAdminAuditLog({
        request,
        admin: { id: admin.user.id, email: admin.user.email },
        action: `refund_${action}`,
        module: "orders",
        targetType: "refund",
        targetId: context.params.refundId,
        result: "failed",
        errorCode: typeof error.code === "string" ? error.code : null,
        errorMessage: message,
        metadata: { action, approvedAmount: body?.approvedAmount ?? null },
      });
      return json({ error: message }, { status: 400 });
    }

    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: `refund_${action}`,
      module: "orders",
      targetType: "refund",
      targetId: context.params.refundId,
      targetLabel: (before.data as Row | null)?.refund_no ? String((before.data as Row).refund_no) : null,
      result: "success",
      beforeSummary: before.data ?? null,
      afterSummary: data ?? null,
      metadata: { action, actionLabel: REFUND_ACTION_LABELS[action], hasProviderRefundId: Boolean(body?.providerRefundId) },
    });

    return json({ result: data });
  } catch (error) {
    console.error("[Admin Refunds] process failed", error);
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: `refund_${action ?? "unknown"}`,
      module: "orders",
      targetType: "refund",
      targetId: context.params.refundId,
      result: "failed",
      errorMessage: error,
    });
    return json({ error: "退款操作失败，请稍后重试。" }, { status: 500 });
  }
}
