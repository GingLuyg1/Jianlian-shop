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

function parseDryRun(value: unknown) {
  return ["1", "true", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

async function handle(request: Request, input: { limit?: unknown; reason?: unknown; dryRun?: unknown }) {
  const auth = assertBep20UnderpaymentJobAuthorized(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const rateLimit = checkRateLimit("internal_task", "internal:bep20_underpayment_settlement");
  if (!rateLimit.allowed) return rateLimit.response!;

  const dryRun = parseDryRun(input.dryRun);
  const limit = parseLimit(input.limit, dryRun ? 10 : 50);
  if (dryRun) {
    const result = await listExpirableBep20UnderpaymentsDryRun(limit);
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  }

  try {
    assertBep20UnderpaymentSettlementConfigured();
  } catch {
    return NextResponse.json(
      { error: "欠额支付结算配置不可用", code: "BEP20_UNDERPAYMENT_SETTLEMENT_NOT_READY" },
      { status: 503 },
    );
  }

  const reason = String(input.reason ?? "payment_timeout_underpayment").trim().slice(0, 500)
    || "payment_timeout_underpayment";
  const result = await processExpiredBep20Underpayments(limit, reason);
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return handle(request, {
    limit: params.get("limit"),
    dryRun: params.get("dry_run"),
    reason: params.get("reason"),
  });
}

export async function POST(request: Request) {
  const sizeError = checkRequestSize(request, 8 * 1024);
  if (sizeError) return sizeError;
  const body = await request.json().catch(() => null) as {
    limit?: number;
    dry_run?: boolean;
    reason?: string;
  } | null;
  return handle(request, {
    limit: body?.limit,
    dryRun: body?.dry_run,
    reason: body?.reason,
  });
}
