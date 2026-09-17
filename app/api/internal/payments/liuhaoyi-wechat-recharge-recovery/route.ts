import { NextResponse } from "next/server";

import { isExplicitLiuhaoyiRecoveryExecution } from "@/lib/payments/liuhaoyi-recovery-policy.mjs";
import { runLiuhaoyiWechatRechargeRecovery } from "@/lib/payments/liuhaoyi-wechat-recovery-service";
import { checkRateLimit, checkRequestSize, getInternalTaskRateLimitKey } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

let running = false;

function configuredSecret() {
  return process.env.PAYMENT_RECONCILIATION_SECRET ?? process.env.INTERNAL_API_SECRET ?? "";
}

export async function POST(request: Request) {
  const expected = configuredSecret();
  const supplied = request.headers.get("x-payment-reconciliation-secret") ?? "";
  if (!expected || supplied !== expected) {
    return NextResponse.json({ error: "无权执行六号易微信充值恢复任务" }, { status: 403 });
  }
  const sizeError = checkRequestSize(request, 4 * 1024);
  if (sizeError) return sizeError;
  const rateLimit = checkRateLimit("internal_task", getInternalTaskRateLimitKey(expected, "liuhaoyi_wechat_recharge_recovery"));
  if (!rateLimit.allowed) return rateLimit.response!;
  if (running) return NextResponse.json({ error: "六号易微信充值恢复任务正在执行" }, { status: 429 });

  const body = await request.json().catch(() => null) as { sessionNo?: unknown; execute?: unknown } | null;
  const sessionNo = typeof body?.sessionNo === "string" ? body.sessionNo.trim() : "";
  if (!sessionNo) return NextResponse.json({ error: "必须明确指定单个支付会话" }, { status: 400 });
  const execute = isExplicitLiuhaoyiRecoveryExecution(body?.execute);

  running = true;
  try {
    const result = await runLiuhaoyiWechatRechargeRecovery({ sessionNo, execute });
    return NextResponse.json({
      mode: result.mode,
      session_no: result.sessionNo,
      session_found: result.sessionFound,
      recharge_found: result.rechargeFound,
      provider_found: result.providerFound,
      provider_paid: result.providerPaid,
      provider_type_match: result.providerTypeMatch,
      amount_match: result.amountMatch,
      paid_within_expiry: result.paidWithinExpiry,
      local_already_credited: result.localAlreadyCredited,
      ledger_count: result.ledgerCount,
      eligible: result.eligible,
      would_complete: result.wouldComplete,
      completed: result.completed,
      idempotent: result.idempotent,
      manual_review: result.manualReview,
      reason: result.reason,
    });
  } catch {
    return NextResponse.json({ error: "六号易微信充值恢复任务执行失败" }, { status: 500 });
  } finally {
    running = false;
  }
}
