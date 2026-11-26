import { NextResponse } from "next/server";

import { checkRateLimit, getUserRateLimitKey } from "@/lib/security/rate-limit";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function getEmailRedirectTo(request: Request) {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
  if (configured && /^https?:\/\//i.test(configured)) {
    return `${configured}/auth/callback?next=${encodeURIComponent("/account")}`;
  }
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (forwardedHost && !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(forwardedHost)) {
    return `${forwardedProto}://${forwardedHost}/auth/callback?next=${encodeURIComponent("/account")}`;
  }
  const reqOrigin = new URL(request.url).origin;
  const origin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(reqOrigin)
    ? "https://www.jianlian.shop"
    : reqOrigin;
  return `${origin}/auth/callback?next=${encodeURIComponent("/account")}`;
}

export async function POST(request: Request) {
  if (!hasSupabaseServerConfig()) {
    return NextResponse.json({ error: "认证服务暂未配置。" }, { status: 503 });
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const rateLimit = checkRateLimit("auth_resend", getUserRateLimitKey(user.id, "auth_resend"));
  if (!rateLimit.allowed) return rateLimit.response!;

  if (user.email_confirmed_at) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  const email = user.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "当前账号缺少可验证邮箱。" }, { status: 400 });
  }

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: getEmailRedirectTo(request) },
  });

  if (error) {
    return NextResponse.json({ error: "验证邮件暂时无法发送，请稍后重试。" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}