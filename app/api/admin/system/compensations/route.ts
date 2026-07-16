import { NextResponse } from "next/server";

import { writeAdminAuditLog, writeRequiredAdminAuditLog } from "@/lib/admin/audit-log-service";
import { requireApiSuperAdmin } from "@/lib/admin/api-auth";
import {
  type CompensationAction,
  listCompensationTasks,
  updateCompensationTaskStatus,
} from "@/lib/transactions/compensation";

export const dynamic = "force-dynamic";

const ACTIONS = new Set<CompensationAction>(["mark_manual_review", "mark_resolved", "mark_cancelled"]);

function numberParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: Request) {
  const admin = await requireApiSuperAdmin();
  if (!admin.ok) return admin.response;

  const params = new URL(request.url).searchParams;
  const result = await listCompensationTasks({
    businessType: params.get("businessType") ?? "all",
    status: params.get("status") ?? "all",
    page: numberParam(params.get("page"), 1),
    pageSize: numberParam(params.get("pageSize"), 20),
  });

  if (result.error) {
    return NextResponse.json({ tasks: [], count: 0, error: result.error }, { status: 503 });
  }

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const admin = await requireApiSuperAdmin();
  if (!admin.ok) return admin.response;

  const body = await request.json().catch(() => null);
  const taskId = typeof body?.taskId === "string" ? body.taskId : "";
  const action = typeof body?.action === "string" ? body.action : "";
  const reason = typeof body?.reason === "string" ? body.reason : "";

  if (!taskId || !ACTIONS.has(action as CompensationAction)) {
    return NextResponse.json({ error: "补偿任务或操作类型不合法。" }, { status: 400 });
  }

  try {
    const result = await updateCompensationTaskStatus({
      taskId,
      action: action as CompensationAction,
      reason,
      adminId: admin.user.id,
    });

    if (!result.ok) {
      await writeAdminAuditLog({
        request,
        admin: { id: admin.user.id, email: admin.user.email },
        module: "system",
        action: `compensation_${action}`,
        targetType: "business_compensation_task",
        targetId: taskId,
        result: "failed",
        errorMessage: result.error,
      });
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await writeRequiredAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      module: "system",
      action: `compensation_${action}`,
      targetType: "business_compensation_task",
      targetId: taskId,
      targetLabel: String(result.task?.business_no ?? result.task?.business_id ?? taskId),
      result: "success",
      beforeSummary: result.before,
      afterSummary: result.task,
      metadata: { reason },
    });

    return NextResponse.json({ task: result.task, message: "补偿任务状态已更新。" });
  } catch (error) {
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email },
      module: "system",
      action: `compensation_${action}`,
      targetType: "business_compensation_task",
      targetId: taskId,
      result: "failed",
      errorMessage: error,
    });
    return NextResponse.json({ error: "补偿任务处理失败，请稍后重试。" }, { status: 500 });
  }
}
