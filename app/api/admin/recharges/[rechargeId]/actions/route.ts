import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { processRechargeReview, type RechargeReviewAction } from "@/lib/recharges/review-service";

const ACTIONS = new Set<RechargeReviewAction>(["start_review", "approve", "reject", "request_more_proof", "cancel", "retry_credit"]);

export async function POST(request: Request, { params }: { params: { rechargeId: string } }) {
  const admin = await getServerAdminContext();
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });
  const body = (await request.json().catch(() => null)) as { action?: unknown; reason?: unknown } | null;
  const action = String(body?.action ?? "") as RechargeReviewAction;
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "不支持的充值审核操作。" }, { status: 400 });
  try {
    const result = await processRechargeReview({ rechargeId: params.rechargeId, action, adminId: admin.user.id, reason, requestId: request.headers.get("x-request-id") ?? undefined });
    await writeAdminAuditLog({ request, admin: { id: admin.user.id, email: admin.user.email ?? null }, action: `recharge_${action}`, module: "recharges", targetType: "account_recharge", targetId: params.rechargeId, targetLabel: result.recharge?.recharge_no ?? null, result: "success", metadata: { idempotent: result.idempotent, requestId: result.requestId }, afterSummary: { status: result.recharge?.status } });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "充值审核操作失败，请稍后重试。";
    await writeAdminAuditLog({ request, admin: { id: admin.user.id, email: admin.user.email ?? null }, action: `recharge_${action}`, module: "recharges", targetType: "account_recharge", targetId: params.rechargeId, result: "failed", errorMessage: message });
    return NextResponse.json({ error: message }, { status: /不存在/.test(message) ? 404 : 409 });
  }
}
