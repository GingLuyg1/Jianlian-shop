import { NextResponse } from "next/server";

import { loadCurrentRechargeDailyRate, toPublicRechargeRate } from "@/lib/payments/recharge-rate-service";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export async function GET() {
  const service = getSupabaseServiceRoleClient();
  if (!service) {
    return NextResponse.json(
      { error: "今日充值汇率暂不可用", code: "RECHARGE_RATE_UNAVAILABLE" },
      { status: 503 },
    );
  }
  try {
    const rate = await loadCurrentRechargeDailyRate(service);
    if (!rate) {
      return NextResponse.json(
        { error: "今日充值汇率尚未设置", code: "RECHARGE_RATE_NOT_CONFIGURED" },
        { status: 503 },
      );
    }
    return NextResponse.json({ rate: toPublicRechargeRate(rate) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "今日充值汇率读取失败", code: "RECHARGE_RATE_READ_FAILED" },
      { status: 503 },
    );
  }
}
