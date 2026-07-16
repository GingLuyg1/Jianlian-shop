import { NextResponse } from "next/server";

import { createBep20PaymentSession, getBep20ErrorMessage, getBep20PaymentSession } from "@/lib/payments/bep20-chain-service";
import { checkRateLimit, getBusinessRateLimitKey } from "@/lib/security/rate-limit";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const userContext = await requireUser();
  if (!userContext.ok) return userContext.response;
  const orderNo = new URL(request.url).searchParams.get("order") ?? "";
  if (!orderNo.trim()) return NextResponse.json({ error: "缺少订单编号" }, { status: 400 });

  const rateLimit = checkRateLimit("payment_status_query", getBusinessRateLimitKey(userContext.user.id, orderNo, "bep20_session"));
  if (!rateLimit.allowed) return rateLimit.response!;

  try {
    const session = await getBep20PaymentSession(orderNo, userContext.user.id);
    return NextResponse.json(session);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const userContext = await requireUser();
  if (!userContext.ok) return userContext.response;
  const body = (await request.json().catch(() => null)) as { order?: string; orderNo?: string } | null;
  const orderNo = String(body?.order ?? body?.orderNo ?? "").trim();
  if (!orderNo) return NextResponse.json({ error: "缺少订单编号" }, { status: 400 });

  const rateLimit = checkRateLimit("payment_session_create", getBusinessRateLimitKey(userContext.user.id, orderNo, "bep20_session_create"));
  if (!rateLimit.allowed) return rateLimit.response!;

  try {
    const session = await createBep20PaymentSession(orderNo, userContext.user.id);
    return NextResponse.json(session);
  } catch (error) {
    return failure(error);
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

function failure(error: unknown) {
  const status = typeof (error as { status?: unknown })?.status === "number" ? Number((error as { status: number }).status) : 500;
  const code = typeof (error as { code?: unknown })?.code === "string" ? String((error as { code: string }).code) : "BEP20_PAYMENT_ERROR";
  return NextResponse.json({ error: getBep20ErrorMessage(error), code }, { status });
}
