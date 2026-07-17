import { NextResponse } from "next/server";

import { getBep20ErrorMessage, verifyBep20TxHash } from "@/lib/payments/bep20-chain-service";
import { checkRateLimit, checkRequestSize, getBusinessRateLimitKey } from "@/lib/security/rate-limit";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userContext = await requireUser();
  if (!userContext.ok) return userContext.response;
  const sizeError = checkRequestSize(request, 4 * 1024);
  if (sizeError) return sizeError;

  const body = (await request.json().catch(() => null)) as { order?: string; order_id?: string; orderNo?: string; tx_hash?: string; txHash?: string; chain_session_id?: string; chainSessionId?: string } | null;
  const orderNo = String(body?.order ?? body?.order_id ?? body?.orderNo ?? "").trim();
  const txHash = String(body?.tx_hash ?? body?.txHash ?? "").trim();
  const chainSessionId = String(body?.chain_session_id ?? body?.chainSessionId ?? "").trim() || null;
  if (!orderNo) return NextResponse.json({ error: "缺少订单编号" }, { status: 400 });
  if (!txHash) return NextResponse.json({ error: "请输入交易哈希" }, { status: 400 });

  const rateLimit = checkRateLimit("payment_session_create", getBusinessRateLimitKey(userContext.user.id, orderNo, "bep20_verify"));
  if (!rateLimit.allowed) return rateLimit.response!;

  try {
    const result = await verifyBep20TxHash({ orderNo, txHash, userId: userContext.user.id, chainSessionId });
    return NextResponse.json(result);
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status: number }).status) : 500;
    const code = typeof (error as { code?: unknown })?.code === "string" ? String((error as { code: string }).code) : "BEP20_VERIFY_ERROR";
    return NextResponse.json({ error: getBep20ErrorMessage(error), code }, { status });
  }
}

async function requireUser() {
  if (!hasSupabaseServerConfig()) {
    return { ok: false as const, response: NextResponse.json({ error: "Supabase 环境变量未配置" }, { status: 503 }) };
  }
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { ok: false as const, response: NextResponse.json({ error: "请先登录后再操作" }, { status: 401 }) };
  }
  return { ok: true as const, user: data.user };
}
