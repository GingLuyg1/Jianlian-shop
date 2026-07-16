import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { requireApiSuperAdmin } from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";

export const dynamic = "force-dynamic";

type AdminUserBody = {
  userId?: string;
  adminLevel?: "admin" | "super_admin";
  status?: "active" | "disabled";
  permissions?: Record<string, unknown>;
  reason?: string;
};

function json(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET() {
  const admin = await requireApiSuperAdmin();
  if (!admin.ok) return admin.response;

  const { data, error } = await admin.supabase
    .from("admin_users")
    .select("user_id,admin_level,status,permissions,created_by,updated_by,created_at,updated_at,reason")
    .order("created_at", { ascending: true });

  if (error) return json({ error: "管理员授权列表读取失败" }, { status: 500 });
  return json({ adminUsers: data ?? [] });
}

export async function POST(request: Request) {
  const admin = await requireApiSuperAdmin();
  if (!admin.ok) return admin.response;
  const body = (await request.json().catch(() => null)) as AdminUserBody | null;
  const userId = String(body?.userId ?? "").trim();
  const reason = String(body?.reason ?? "").trim();
  const requestId = randomUUID();

  if (!userId) return json({ error: "缺少用户 ID" }, { status: 400 });
  if (!reason) return json({ error: "请填写管理员授权原因" }, { status: 400 });
  if (body?.adminLevel && !["admin", "super_admin"].includes(body.adminLevel)) {
    return json({ error: "管理员级别不合法" }, { status: 400 });
  }
  if (body?.status && !["active", "disabled"].includes(body.status)) {
    return json({ error: "管理员状态不合法" }, { status: 400 });
  }

  const { data, error } = await admin.supabase.rpc("manage_admin_user", {
    p_target_user_id: userId,
    p_admin_level: body?.adminLevel ?? "admin",
    p_status: body?.status ?? "active",
    p_permissions: body?.permissions ?? {},
    p_reason: reason,
  });
  if (error) {
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "admin_authorization_create",
      module: "users",
      targetType: "admin_user",
      targetId: userId,
      requestId,
      result: "failed",
      errorCode: error.code,
      errorMessage: error,
    });
    return json({ error: "管理员授权失败", request_id: requestId }, { status: 400 });
  }

  const audit = await writeAdminAuditLog({
    request,
    admin: { id: admin.user.id, email: admin.user.email },
    action: "admin_authorization_create",
    module: "users",
    targetType: "admin_user",
    targetId: userId,
    requestId,
    result: "success",
    afterSummary: data,
    metadata: { reason },
  });
  return json({ adminUser: data, request_id: requestId, warning_code: audit.ok ? null : "GENERAL_AUDIT_WRITE_FAILED" });
}
