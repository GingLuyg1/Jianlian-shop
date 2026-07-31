import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import {
  classifyRechargeReviewError,
  processRechargeReview,
  RechargeReviewAuditError,
  type RechargeReviewAction,
} from "@/lib/recharges/review-service";

const ACTIONS = new Set<RechargeReviewAction>([
  "start_review",
  "approve",
  "reject",
  "request_more_proof",
  "cancel",
  "retry_credit",
]);

export async function POST(
  request: Request,
  { params }: { params: { rechargeId: string } },
) {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    return NextResponse.json(
      { error: admin.message },
      { status: admin.status },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { action?: unknown; reason?: unknown }
    | null;
  const action = String(body?.action ?? "") as RechargeReviewAction;
  const reason = typeof body?.reason === "string"
    ? body.reason.trim().slice(0, 500)
    : "";
  const requestId = (
    request.headers.get("x-request-id")?.trim()
    || randomUUID()
  ).slice(0, 160);

  if (!ACTIONS.has(action)) {
    return NextResponse.json(
      {
        error: "不支持的充值审核操作。",
        code: "RECHARGE_REVIEW_INVALID_ACTION",
        requestId,
        outcome: "failed",
        idempotent: false,
        requiresManualReconciliation: false,
        safeMessage: "不支持的充值审核操作。",
      },
      { status: 400 },
    );
  }

  try {
    const result = await processRechargeReview({
      rechargeId: params.rechargeId,
      action,
      adminId: admin.user.id,
      reason,
      requestId,
    });
    try {
      await writeAdminAuditLog({
        request,
        admin: {
          id: admin.user.id,
          email: admin.user.email ?? null,
        },
        action: `recharge_${action}`,
        module: "recharges",
        targetType: "account_recharge",
        targetId: params.rechargeId,
        targetLabel: result.recharge.recharge_no,
        requestId: result.requestId,
        result: "success",
        metadata: {
          idempotent: result.idempotent,
          outcome: result.outcome,
          requiresManualReconciliation:
            result.requiresManualReconciliation,
        },
        afterSummary: { status: result.recharge.status },
      });
    } catch {
      const classified = classifyRechargeReviewError(
        new RechargeReviewAuditError(true, result.recharge.status),
        result.requestId,
      );
      return NextResponse.json(classified.body, { status: classified.status });
    }
    return NextResponse.json({
      code: result.code,
      safeMessage: result.safeMessage,
      message: result.safeMessage,
      requestId: result.requestId,
      outcome: result.outcome,
      idempotent: result.idempotent,
      requiresManualReconciliation: result.requiresManualReconciliation,
      recharge: {
        id: result.recharge.id,
        rechargeNo: result.recharge.recharge_no,
        status: result.recharge.status,
      },
    });
  } catch (error) {
    const classified = classifyRechargeReviewError(error, requestId);
    await writeAdminAuditLog({
      request,
      admin: {
        id: admin.user.id,
        email: admin.user.email ?? null,
      },
      action: `recharge_${action}`,
      module: "recharges",
      targetType: "account_recharge",
      targetId: params.rechargeId,
      requestId,
      result: classified.body.requiresManualReconciliation
        ? "partial"
        : "failed",
      errorCode: classified.body.code,
      errorMessage: classified.body.error,
      metadata: {
        outcome: classified.body.outcome,
        requiresManualReconciliation:
          classified.body.requiresManualReconciliation,
      },
    }).catch(() => undefined);
    return NextResponse.json(
      classified.body,
      { status: classified.status },
    );
  }
}
