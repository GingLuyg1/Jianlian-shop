import { NextResponse } from "next/server";

import { getSafeErrorMessage } from "@/lib/payments/payment-errors";
import { runPaymentReconciliation } from "@/lib/payments/reconciliation-service";
import { checkRateLimit, checkRequestSize, getInternalTaskRateLimitKey } from "@/lib/security/rate-limit";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

let running = false;

type SafeReconciliationError = {
  message: string;
  paymentSessionId?: string;
};

function sanitizeReconciliationErrors(
  errors: Array<{ message?: string; paymentSessionId?: string }> = []
): SafeReconciliationError[] {
  return errors.slice(0, 20).map((error) => ({
    message: getSafeErrorMessage(error, "支付对账记录处理失败"),
    paymentSessionId: error.paymentSessionId,
  }));
}
function getInternalSecret() {
  return process.env.PAYMENT_RECONCILIATION_SECRET ?? process.env.INTERNAL_API_SECRET ?? "";
}

export async function POST(request: Request) {
  const configuredSecret = getInternalSecret();
  const requestSecret = request.headers.get("x-internal-secret") ?? request.headers.get("x-payment-reconciliation-secret") ?? "";

  if (!configuredSecret || requestSecret !== configuredSecret) {
    return NextResponse.json({ error: "无权执行支付对账任务" }, { status: 403 });
  }

  const sizeError = checkRequestSize(request, 8 * 1024);
  if (sizeError) return sizeError;
  const rateLimit = checkRateLimit("internal_task", getInternalTaskRateLimitKey(configuredSecret, "payment_reconcile"));
  if (!rateLimit.allowed) return rateLimit.response!;

  if (running) {
    return NextResponse.json({ error: "支付对账任务正在执行，请稍后重试" }, { status: 429 });
  }

  running = true;
  let runId: string | null = null;

  try {
    const body = (await request.json().catch(() => null)) as {
      paymentSessionId?: string;
      businessType?: "order" | "recharge";
      batchSize?: number;
      dryRun?: boolean;
    } | null;

    runId = await createReconciliationRun({
      triggerSource: "internal_api",
      dryRun: Boolean(body?.dryRun),
      batchSize: body?.batchSize,
      paymentSessionId: body?.paymentSessionId,
      businessType: body?.businessType,
    });

    const result = await runPaymentReconciliation({
      paymentSessionId: body?.paymentSessionId,
      businessType: body?.businessType,
      batchSize: body?.batchSize,
      dryRun: Boolean(body?.dryRun),
      reason: "internal_api",
    });

    await finishReconciliationRun(runId, "completed", {
      processed: result.processed,
      matched: result.matched,
      mismatched: result.mismatched,
      pending: result.pending,
      query_failed: result.query_failed,
      manual_review: result.manual_review,
      resolved: result.resolved,
      skipped: result.skipped,
      error_count: result.errors.length,
    });
    const safeErrors = sanitizeReconciliationErrors(result.errors);
    await writeReconciliationRunLogs(
      runId,
      safeErrors.map((error) => ({
        level: "error",
        message: error.message,
        paymentSessionId: error.paymentSessionId,
      }))
    );

    return NextResponse.json({
      processed: result.processed,
      matched: result.matched,
      mismatched: result.mismatched,
      pending: result.pending,
      query_failed: result.query_failed,
      manual_review: result.manual_review,
      resolved: result.resolved,
      skipped: result.skipped,
      error_count: result.errors.length,
      errors: safeErrors,
    });
  } catch (error) {
    await finishReconciliationRun(runId, "failed", {
      error_message: getSafeErrorMessage(error, "支付对账任务执行失败"),
      error_count: 1,
    });
    return NextResponse.json({ error: "支付对账任务执行失败" }, { status: 500 });
  } finally {
    running = false;
  }
}

async function createReconciliationRun(input: {
  triggerSource: string;
  dryRun: boolean;
  batchSize?: number;
  paymentSessionId?: string;
  businessType?: "order" | "recharge";
}) {
  const service = getSupabaseServiceRoleClient();
  if (!service) return null;

  const { data, error } = await service
    .from("payment_reconciliation_runs")
    .insert({
      run_no: `RCR${Date.now()}${Math.floor(Math.random() * 1000)}`,
      trigger_source: input.triggerSource,
      dry_run: input.dryRun,
      status: "running",
      batch_size: input.batchSize ?? null,
      metadata: {
        paymentSessionId: input.paymentSessionId ?? null,
        businessType: input.businessType ?? null,
      },
    })
    .select("id")
    .single();

  if (error) {
    console.error("[Payment reconciliation] run record skipped", getSafeErrorMessage(error, "reconciliation run log unavailable"));
    return null;
  }

  return String(data.id);
}

async function finishReconciliationRun(
  runId: string | null,
  status: "completed" | "failed",
  values: Record<string, unknown>
) {
  if (!runId) return;
  const service = getSupabaseServiceRoleClient();
  if (!service) return;

  const { error } = await service
    .from("payment_reconciliation_runs")
    .update({
      ...values,
      status,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId);

  if (error) {
    console.error("[Payment reconciliation] run update skipped", getSafeErrorMessage(error, "reconciliation run update unavailable"));
  }
}

async function writeReconciliationRunLogs(
  runId: string | null,
  logs: Array<{ level: string; message: string; paymentSessionId?: string }>
) {
  if (!runId || logs.length === 0) return;
  const service = getSupabaseServiceRoleClient();
  if (!service) return;

  const { error } = await service.from("payment_reconciliation_logs").insert(
    logs.map((log) => ({
      run_id: runId,
      payment_session_id: log.paymentSessionId ?? null,
      level: log.level,
      message: log.message,
    }))
  );

  if (error) {
    console.error("[Payment reconciliation] run logs skipped", getSafeErrorMessage(error, "reconciliation run logs unavailable"));
  }
}

