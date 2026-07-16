import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { requireApiSuperAdmin } from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: { userId: string } };
type PatchBody = {
  adminLevel?: "admin" | "super_admin";
  status?: "active" | "disabled";
  permissions?: Record<string, unknown>;
  reason?: string;
};

export async function PATCH(request: Request, context: RouteContext) {
  const admin = await requireApiSuperAdmin();
  if (!admin.ok) return admin.response;
  const body = (await request.json().catch(() => null)) as PatchBody | null;
  const reason = String(body?.reason ?? "").trim();
  const requestId = randomUUID();
  if (!reason) return NextResponse.json({ error: "请填写管理员变更原因" }, { status: 400 });

  const { data, error } = await admin.supabase.rpc("manage_admin_user", {
    p_target_user_id: context.params.userId,
    p_admin_level: body?.adminLevel ?? null,
    p_status: body?.status ?? null,
    p_permissions: body?.permissions ?? null,
    p_reason: reason,
  });
  if (error) {
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "admin_authorization_update",
      module: "users",
      targetType: "admin_user",
      targetId: context.params.userId,
      requestId,
      result: "failed",
      errorCode: error.code,
      errorMessage: error,
    });
    const conflict = /LAST_ACTIVE_SUPER_ADMIN_REQUIRED|SELF_DEMOTION/i.test(error.message);
    return NextResponse.json(
      { error: conflict ? "不能禁用或降级最后一个超级管理员" : "管理员授权更新失败", request_id: requestId },
      { status: conflict ? 409 : 400 }
    );
  }

  const audit = await writeAdminAuditLog({
    request,
    admin: { id: admin.user.id, email: admin.user.email },
    action: "admin_authorization_update",
    module: "users",
    targetType: "admin_user",
    targetId: context.params.userId,
    requestId,
    result: "success",
    afterSummary: data,
    metadata: { reason },
  });
  return NextResponse.json({ adminUser: data, request_id: requestId, warning_code: audit.ok ? null : "GENERAL_AUDIT_WRITE_FAILED" });
}
