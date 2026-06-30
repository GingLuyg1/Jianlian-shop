import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { requireApiAdmin } from "@/lib/admin/api-auth";
import { listDataConsistencyState, runDataConsistencyScan } from "@/lib/consistency/scanner";

export const dynamic = "force-dynamic";

const SUPER_ADMIN_EMAIL = "gac000189@gmail.com";

function isSuperAdmin(email?: string | null) {
  return email?.toLowerCase() === SUPER_ADMIN_EMAIL;
}

function safeError(error: unknown, fallback = "数据巡检操作失败") {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function GET(request: Request) {
  const admin = await requireApiAdmin();
  if (!admin.ok) return admin.response;
  if (!isSuperAdmin(admin.user.email)) {
    return NextResponse.json({ error: "无权查看数据巡检。" }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  try {
    const result = await listDataConsistencyState({
      severity: params.get("severity") ?? "all",
      ruleCode: params.get("ruleCode") ?? "all",
      status: params.get("status") ?? "all",
      page: Number(params.get("page") ?? 1),
      pageSize: Number(params.get("pageSize") ?? 20),
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = safeError(error, "数据巡检记录读取失败，请确认 migration 已执行。");
    return NextResponse.json({ error: message, issues: [], count: 0 }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const admin = await requireApiAdmin();
  if (!admin.ok) return admin.response;
  if (!isSuperAdmin(admin.user.email)) {
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "run_data_consistency_scan",
      module: "system",
      result: "denied",
      errorMessage: "非超级管理员尝试执行数据巡检",
    });
    return NextResponse.json({ error: "无权执行数据巡检。" }, { status: 403 });
  }

  try {
    const result = await runDataConsistencyScan({ runType: "manual", persist: true, triggeredBy: admin.user.id });
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "run_data_consistency_scan",
      module: "system",
      result: "success",
      targetType: "data_consistency_run",
      targetId: result.runId,
      afterSummary: {
        checkedRules: result.checkedRules,
        issueCount: result.issueCount,
        criticalCount: result.criticalCount,
        status: result.status,
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      action: "run_data_consistency_scan",
      module: "system",
      result: "failed",
      errorMessage: error,
    });
    return NextResponse.json({ error: safeError(error, "数据巡检执行失败") }, { status: 500 });
  }
}
