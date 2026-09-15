import { NextResponse } from "next/server";

import {
  isExplicitLiuhaoyiRecoveryExecution,
  LIUHAOYI_ALIPAY_RECHARGE_RECOVERY_MODE,
} from "@/lib/payments/liuhaoyi-recovery-policy.mjs";
import { runPaymentReconciliation } from "@/lib/payments/reconciliation-service";
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
    return NextResponse.json({ error: "无权执行六号易充值恢复任务" }, { status: 403 });
  }

  const sizeError = checkRequestSize(request, 4 * 1024);
  if (sizeError) return sizeError;
  const rateLimit = checkRateLimit(
    "internal_task",
    getInternalTaskRateLimitKey(expected, "liuhaoyi_alipay_recharge_recovery"),
  );
  if (!rateLimit.allowed) return rateLimit.response!;
  if (running) {
    return NextResponse.json({ error: "六号易充值恢复任务正在执行" }, { status: 429 });
  }

  running = true;
  try {
    const body = await request.json().catch(() => null) as {
      batchSize?: unknown;
      execute?: unknown;
    } | null;
    const execute = isExplicitLiuhaoyiRecoveryExecution(body?.execute);
    const parsedBatchSize = Number(body?.batchSize ?? 20);
    const batchSize = Number.isInteger(parsedBatchSize)
      ? Math.min(20, Math.max(1, parsedBatchSize))
      : 20;
    const result = await runPaymentReconciliation({
      businessType: "recharge",
      batchSize,
      dryRun: !execute,
      reason: "liuhaoyi_alipay_recharge_worker",
      recoveryMode: LIUHAOYI_ALIPAY_RECHARGE_RECOVERY_MODE,
    });
    return NextResponse.json({
      mode: execute ? "execute" : "dry_run",
      processed: result.processed,
      resolved: result.resolved,
      manual_review: result.manual_review,
      pending: result.pending,
      query_failed: result.query_failed,
      skipped: result.skipped,
      error_count: result.errors.length,
    });
  } catch {
    return NextResponse.json({ error: "六号易充值恢复任务执行失败" }, { status: 500 });
  } finally {
    running = false;
  }
}
