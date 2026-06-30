import { NextResponse } from "next/server";

import { hashOrderQueryToken, verifyOrderQueryToken } from "@/lib/orders/order-query-service";
import { checkRateLimit, checkRequestSize, getUserRateLimitKey } from "@/lib/security/rate-limit";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const GENERIC_ERROR = "订单信息或验证信息不正确";

export async function POST(request: Request) {
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json({ error: "订单系统暂时不可用" }, { status: 503 });
  }
  const sizeError = checkRequestSize(request, 8 * 1024);
  if (sizeError) return sizeError;

  const supabase = getSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const limit = checkRateLimit("order_lookup", getUserRateLimitKey(user.id, "order_bind"));
  if (!limit.allowed) return limit.response!;

  const body = (await request.json().catch(() => null)) as { orderNo?: string; queryToken?: string; confirm?: boolean } | null;
  const orderNo = String(body?.orderNo ?? "").trim();
  const queryToken = String(body?.queryToken ?? "").trim();
  if (!body?.confirm || !orderNo || !queryToken) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("orders")
    .select("id,user_id,order_no,order_query_token_hash,order_query_token_expires_at,order_query_token_revoked_at")
    .eq("order_no", orderNo)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 404 });
  }

  const row = data as Record<string, any>;
  const expired = row.order_query_token_expires_at ? new Date(row.order_query_token_expires_at).getTime() <= Date.now() : false;
  if (row.order_query_token_revoked_at || expired || !verifyOrderQueryToken(queryToken, row.order_query_token_hash)) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 404 });
  }

  if (row.user_id && row.user_id !== user.id) {
    return NextResponse.json({ error: "该订单已绑定其他账号" }, { status: 403 });
  }

  if (row.user_id === user.id) {
    return NextResponse.json({ ok: true, orderNo: row.order_no, bound: true });
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ user_id: user.id, order_query_token_revoked_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("user_id", null)
    .eq("order_query_token_hash", hashOrderQueryToken(queryToken));

  if (updateError) {
    return NextResponse.json({ error: "订单绑定失败，请稍后重试" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, orderNo: row.order_no, bound: true });
}
