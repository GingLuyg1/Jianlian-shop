import { NextResponse } from "next/server";

import { writeAdminAuditLog, writeRequiredAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext, getServerSuperAdminContext } from "@/lib/auth/require-admin";
import { deriveRechargeSettlementRate } from "@/lib/payments/recharge-rate.mjs";
import { currentShanghaiDate, loadCurrentRechargeDailyRate, toPublicRechargeRate } from "@/lib/payments/recharge-rate-service";
import { enforceAdminWriteGuard } from "@/lib/security/rate-limit";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  const admin = await getServerAdminContext();
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });
  const service = getSupabaseServiceRoleClient();
  if (!service) return NextResponse.json({ error: "充值汇率服务不可用" }, { status: 503 });
  try {
    const rate = await loadCurrentRechargeDailyRate(service);
    return NextResponse.json({ rate: rate ? toPublicRechargeRate(rate) : null, effectiveDate: currentShanghaiDate() });
  } catch {
    return NextResponse.json({ error: "充值汇率读取失败" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const admin = await getServerSuperAdminContext();
  if (!admin.ok) {
    await writeAdminAuditLog({
      request,
      action: "create_recharge_daily_rate",
      module: "recharges",
      targetType: "account_recharge_daily_rate",
      result: "denied",
      errorMessage: admin.message,
    });
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }
  const guardError = enforceAdminWriteGuard(request, admin.user.id, "recharge_rate_create", 16 * 1024);
  if (guardError) return guardError;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const effectiveDate = typeof body?.effectiveDate === "string" ? body.effectiveDate.trim() : "";
  const marketRate = typeof body?.marketRate === "string" ? body.marketRate.trim() : "";
  const source = typeof body?.source === "string" ? body.source.trim() : "";
  const settlementRate = deriveRechargeSettlementRate(marketRate);
  if (!DATE_PATTERN.test(effectiveDate) || !settlementRate || !source || source.length > 120) {
    return NextResponse.json({ error: "充值汇率参数无效", code: "RECHARGE_RATE_INVALID" }, { status: 400 });
  }
  const service = getSupabaseServiceRoleClient();
  if (!service) return NextResponse.json({ error: "充值汇率服务不可用" }, { status: 503 });
  const { data, error } = await service.from("account_recharge_daily_rates").insert({
    effective_date: effectiveDate,
    market_rate: marketRate,
    settlement_rate: settlementRate,
    source,
    effective_at: new Date().toISOString(),
    created_by: admin.user.id,
  }).select("effective_date,market_rate,settlement_rate,source,effective_at,created_at").maybeSingle();
  if (error) {
    await writeAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email ?? null },
      action: "create_recharge_daily_rate",
      module: "recharges",
      targetType: "account_recharge_daily_rate",
      targetId: effectiveDate,
      result: "failed",
      errorCode: error.code,
      errorMessage: error.code === "23505" ? "该日期已有充值汇率" : "充值汇率保存失败",
    });
    if (error.code === "23505") {
      return NextResponse.json({ error: "该日期已有充值汇率，不允许覆盖", code: "RECHARGE_RATE_ALREADY_EXISTS" }, { status: 409 });
    }
    return NextResponse.json({ error: "充值汇率保存失败", code: "RECHARGE_RATE_SAVE_FAILED" }, { status: 503 });
  }
  try {
    await writeRequiredAdminAuditLog({
      request,
      admin: { id: admin.user.id, email: admin.user.email ?? null },
      action: "create_recharge_daily_rate",
      module: "recharges",
      targetType: "account_recharge_daily_rate",
      targetId: effectiveDate,
      result: "success",
      afterSummary: { effectiveDate, marketRate, settlementRate, source },
    });
  } catch {
    return NextResponse.json(
      { rate: toPublicRechargeRate(data as never), warning_code: "GENERAL_AUDIT_WRITE_FAILED" },
      { status: 201 }
    );
  }
  return NextResponse.json({ rate: toPublicRechargeRate(data as never) }, { status: 201 });
}
