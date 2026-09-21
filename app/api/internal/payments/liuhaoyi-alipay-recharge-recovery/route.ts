import { NextResponse } from "next/server";

import { isExplicitLiuhaoyiRecoveryExecution } from "@/lib/payments/liuhaoyi-recovery-policy.mjs";
import { runLiuhaoyiAlipayRechargeRecovery } from "@/lib/payments/liuhaoyi-alipay-recovery-service";
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
    return NextResponse.json({ error: "Unauthorized Alipay recharge recovery task" }, { status: 403 });
  }
  const sizeError = checkRequestSize(request, 4 * 1024);
  if (sizeError) return sizeError;
  const rateLimit = checkRateLimit("internal_task", getInternalTaskRateLimitKey(expected, "liuhaoyi_alipay_recharge_recovery"));
  if (!rateLimit.allowed) return rateLimit.response!;
  if (running) return NextResponse.json({ error: "Alipay recharge recovery task is already running" }, { status: 429 });

  const body = await request.json().catch(() => null) as {
    sessionNo?: unknown; execute?: unknown; queryTimeoutMs?: unknown;
  } | null;
  const sessionNo = typeof body?.sessionNo === "string" ? body.sessionNo.trim() : "";
  if (!sessionNo) return NextResponse.json({ error: "A single payment session is required" }, { status: 400 });
  const execute = isExplicitLiuhaoyiRecoveryExecution(body?.execute);
  if (execute && process.env.LIUHAOYI_ALIPAY_WATCHER_EXECUTE_ENABLED !== "true") {
    return NextResponse.json({ error: "Alipay recovery execution is not enabled" }, { status: 403 });
  }

  running = true;
  try {
    const queryTimeoutMs = typeof body?.queryTimeoutMs === "number" && Number.isInteger(body.queryTimeoutMs)
      && body.queryTimeoutMs >= 1_000 && body.queryTimeoutMs <= 8_000 ? body.queryTimeoutMs : undefined;
    const result = await runLiuhaoyiAlipayRechargeRecovery({ sessionNo, execute, queryTimeoutMs });
    return NextResponse.json({
      mode: result.mode, session_no: result.sessionNo, session_found: result.sessionFound,
      recharge_found: result.rechargeFound, provider_found: result.providerFound,
      provider_paid: result.providerPaid, provider_type_match: result.providerTypeMatch,
      amount_match: result.amountMatch, paid_within_expiry: result.paidWithinExpiry,
      local_already_credited: result.localAlreadyCredited, ledger_count: result.ledgerCount,
      eligible: result.eligible, would_complete: result.wouldComplete,
      completed: result.completed, idempotent: result.idempotent,
      manual_review: result.manualReview, reason: result.reason,
    });
  } catch {
    return NextResponse.json({ error: "Alipay recharge recovery task failed" }, { status: 500 });
  } finally {
    running = false;
  }
}
