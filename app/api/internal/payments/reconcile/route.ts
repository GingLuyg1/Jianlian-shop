import { NextResponse } from "next/server";

import { runPaymentReconciliation } from "@/lib/payments/reconciliation-service";

export const dynamic = "force-dynamic";

let running = false;

function getInternalSecret() {
  return process.env.PAYMENT_RECONCILIATION_SECRET ?? process.env.INTERNAL_API_SECRET ?? "";
}

export async function POST(request: Request) {
  const configuredSecret = getInternalSecret();
  const requestSecret = request.headers.get("x-internal-secret") ?? request.headers.get("x-payment-reconciliation-secret") ?? "";

  if (!configuredSecret || requestSecret !== configuredSecret) {
    return NextResponse.json({ error: "无权执行支付对账任务" }, { status: 403 });
  }

  if (running) {
    return NextResponse.json({ error: "支付对账任务正在执行，请稍后重试" }, { status: 429 });
  }

  running = true;
  try {
    const body = (await request.json().catch(() => null)) as {
      paymentSessionId?: string;
      businessType?: "order" | "recharge";
      batchSize?: number;
      dryRun?: boolean;
    } | null;
    const result = await runPaymentReconciliation({
      paymentSessionId: body?.paymentSessionId,
      businessType: body?.businessType,
      batchSize: body?.batchSize,
      dryRun: Boolean(body?.dryRun),
      reason: "internal_api",
    });

    return NextResponse.json({
      processed: result.processed,
      matched: result.matched,
      mismatched: result.mismatched,
      pending: result.pending,
      query_failed: result.query_failed,
      manual_review: result.manual_review,
      resolved: result.resolved,
      skipped: result.skipped,
      errors: result.errors,
    });
  } catch (_error) {
    return NextResponse.json({ error: "支付对账任务执行失败" }, { status: 500 });
  } finally {
    running = false;
  }
}
