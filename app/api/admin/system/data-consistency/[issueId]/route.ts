import { NextResponse } from "next/server";

import { requireApiSuperAdmin } from "@/lib/admin/api-auth";
import { updateConsistencyIssueStatus } from "@/lib/consistency/scanner";

export const dynamic = "force-dynamic";

const VALID_STATUS = new Set(["open", "investigating", "resolved", "ignored"]);

function safeError(error: unknown, fallback = "数据巡检异常处理失败") {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function PATCH(request: Request, { params }: { params: { issueId: string } }) {
  const admin = await requireApiSuperAdmin();
  if (!admin.ok) return admin.response;

  const body = await request.json().catch(() => ({}));
  const status = typeof body.status === "string" ? body.status : "";
  const note = typeof body.note === "string" ? body.note : "";
  if (!VALID_STATUS.has(status)) {
    return NextResponse.json({ error: "处理状态无效。" }, { status: 400 });
  }
  if (!note.trim()) {
    return NextResponse.json({ error: "处理备注不能为空。" }, { status: 400 });
  }

  try {
    const issue = await updateConsistencyIssueStatus({
      issueId: params.issueId,
      status: status as "open" | "investigating" | "resolved" | "ignored",
      note,
      adminId: admin.user.id,
      adminEmail: admin.user.email,
      request,
    });
    return NextResponse.json({ issue });
  } catch (error) {
    return NextResponse.json({ error: safeError(error) }, { status: 500 });
  }
}
