import { NextResponse } from "next/server";

import {
  assertBep20UnderpaymentSettlementConfigured,
  assertBep20UnderpaymentJobAuthorized,
  listExpirableBep20UnderpaymentsDryRun,
  processExpiredBep20Underpayments,
} from "@/lib/payments/bep20-underpayment-service";
import { checkRateLimit, checkRequestSize } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

function parseLimit(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Math.max(1, Math.min(Number.isFinite(parsed) ? Math.floor(parsed) : fallback, 200));
}

function authorize(request: Request) {
  const auth = assertBep20UnderpaymentJobAuthorized(request);
  if (!auth.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { success: false, code: "BEP20_UNDERPAYMENT_JOB_UNAUTHORIZED", message: auth.message },
        { status: auth.status },
      ),
    };
  }

  const rateLimit = checkRateLimit("internal_task", "internal:bep20_underpayment_settlement");
  if (!rateLimit.allowed) return { ok: false as const, response: rateLimit.response! };
  return { ok: true as const };
}

async function handleDryRun(request: Request, limitInput: unknown) {
  const auth = authorize(request);
  if (!auth.ok) return auth.response;
  const result = await listExpirableBep20UnderpaymentsDryRun(parseLimit(limitInput, 10));
  if (!result.ok) {
    return NextResponse.json(
      { success: false, dry_run: true, code: result.code, message: result.message },
      { status: 503 },
    );
  }
  return NextResponse.json({
    success: true,
    dry_run: true,
    eligible: result.candidateCount > 0,
    preview: {
      candidate_count: result.candidateCount,
      candidates: result.candidates,
      request_id: result.requestId,
    },
  });
}

async function handleSettlement(
  request: Request,
  input: { limit?: unknown; reason?: unknown; requestId?: unknown },
) {
  const auth = authorize(request);
  if (!auth.ok) return auth.response;
  try {
    assertBep20UnderpaymentSettlementConfigured();
  } catch {
    return NextResponse.json(
      { success: false, message: "欠额支付结算配置不可用", code: "BEP20_UNDERPAYMENT_SETTLEMENT_NOT_READY" },
      { status: 503 },
    );
  }

  const reason = String(input.reason ?? "").trim();
  const requestId = String(input.requestId ?? "").trim();
  if (reason.length < 1 || reason.length > 500 || requestId.length < 1 || requestId.length > 120) {
    return NextResponse.json(
      { success: false, code: "BEP20_UNDERPAYMENT_INPUT_INVALID", message: "处理原因或请求编号无效。" },
      { status: 400 },
    );
  }

  const result = await processExpiredBep20Underpayments(
    parseLimit(input.limit, 50),
    reason,
    requestId,
  );
  return NextResponse.json(
    {
      success: result.ok,
      dry_run: false,
      result: result.ok ? "processed" : "failed",
      idempotent: result.ok && result.processed === 0 && result.skipped > 0,
      settlement: result,
    },
    { status: result.ok ? 200 : 503 },
  );
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return handleDryRun(request, params.get("limit"));
}

export async function POST(request: Request) {
  const sizeError = checkRequestSize(request, 8 * 1024);
  if (sizeError) return sizeError;
  const body = await request.json().catch(() => null) as {
    action?: string;
    limit?: number;
    dry_run?: boolean;
    reason?: string;
    request_id?: string;
  } | null;
  if (body?.action === "settle" && body?.dry_run === false) {
    return handleSettlement(request, {
      limit: body.limit,
      reason: body.reason,
      requestId: body.request_id,
    });
  }
  return handleDryRun(request, body?.limit);
}
