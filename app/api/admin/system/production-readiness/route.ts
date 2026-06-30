import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { buildProductionReadinessPayload } from "@/lib/admin/production-readiness";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

export async function GET(request: Request) {
  const admin = await requireApiAdmin();
  if (!admin.ok) return admin.response;

  const supabase = getSupabaseServiceRoleClient() ?? admin.supabase;

  try {
    const payload = await buildProductionReadinessPayload(supabase);
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      module: "system",
      action: "production_readiness_check",
      targetType: "production_readiness",
      result: payload.summary.status === "blocked" ? "failed" : "success",
      metadata: {
        blockedCount: payload.summary.blockedCount,
        warningCount: payload.summary.warningCount,
        suspectedTestRecords: payload.summary.suspectedTestRecords,
      },
    });
    return json(payload);
  } catch (error) {
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      module: "system",
      action: "production_readiness_check",
      targetType: "production_readiness",
      result: "failed",
      errorMessage: error,
    });
    return json({ error: "生产数据封板检查失败，请稍后重试。" }, { status: 500 });
  }
}
