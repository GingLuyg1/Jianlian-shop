import { NextResponse } from "next/server";

import {
  getPaymentErrorMessage,
  isPaymentSchemaUnavailable,
  normalizeChannelRow,
} from "@/lib/payments/recharge-utils";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json({ error: "Supabase 环境变量未配置" }, { status: 503 });
  }
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("payment_channels")
      .select("channel,code,enabled,display_name,currency,network,min_amount,minimum_amount,fee_rate,provider,provider_name,sort_order")
      .eq("enabled", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    const channels = ((data ?? []) as Record<string, unknown>[])
      .map(normalizeChannelRow)
      .filter((channel): channel is NonNullable<typeof channel> => Boolean(channel));
    return NextResponse.json({ channels });
  } catch (error) {
    console.error("[Recharge channels]", error);
    return NextResponse.json(
      { error: isPaymentSchemaUnavailable(error) ? "支付数据库尚未初始化，请先执行支付管理 migration。" : getPaymentErrorMessage(error, "支付渠道加载失败，请稍后重试") },
      { status: isPaymentSchemaUnavailable(error) ? 503 : 500 }
    );
  }
}
