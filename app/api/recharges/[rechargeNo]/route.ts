import { NextResponse } from "next/server";

import { getPaymentErrorMessage, isPaymentSchemaUnavailable, normalizeRechargeRow } from "@/lib/payments/recharge-utils";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { rechargeNo: string } }) {
  if (!hasSupabaseServerConfig()) return NextResponse.json({ error: "Supabase 环境变量未配置" }, { status: 503 });
  const supabase = getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return NextResponse.json({ error: "请先登录后再操作" }, { status: 401 });
  try {
    const { data, error } = await supabase.from("account_recharges").select("recharge_no,channel,channel_code,channel_name,currency,network,amount,requested_amount,fee_amount,payable_amount,received_amount,credited_amount,status,created_at,paid_at").eq("recharge_no", params.rechargeNo).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "充值记录不存在" }, { status: 404 });
    return NextResponse.json({ data: normalizeRechargeRow(data as Record<string, unknown>) });
  } catch (error) {
    console.error("[Recharge detail]", error);
    return NextResponse.json({ error: isPaymentSchemaUnavailable(error) ? "支付数据库尚未初始化，请先执行支付管理 migration。" : getPaymentErrorMessage(error, "充值记录加载失败，请稍后重试") }, { status: isPaymentSchemaUnavailable(error) ? 503 : 500 });
  }
}
