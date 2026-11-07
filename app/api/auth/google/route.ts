import { NextResponse } from "next/server";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { getSafeInternalRedirect } from "@/lib/auth/redirect";
import { getAuthSiteOrigin } from "@/lib/auth/site-origin";
import { GOOGLE_INVITE_CODE, GOOGLE_SIGNUP_COOKIE, GOOGLE_SIGNUP_MAX_AGE, signGoogleSignupIntent, readGoogleSignupIntent } from "@/lib/auth/google-signup-intent";
import { checkRequestSize, checkRateLimit, getRequestSourceKey } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin) return NextResponse.json({ error: "请求来源无效。" }, { status: 403 });
  if (process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED !== "true" || !hasSupabaseServerConfig()) {
    return NextResponse.json({ error: "Google 登录尚未配置。" }, { status: 503 });
  }
  const sizeError = checkRequestSize(request, 2048);
  if (sizeError) return sizeError;
  const limit = checkRateLimit("auth_resend", getRequestSourceKey(request));
  if (!limit.allowed) return limit.response!;
  const body = await request.json().catch(() => null);
  if (!body || !["register", "login"].includes(body.mode) || (body.mode === "register" && body.acceptedTerms !== true)) {
    return NextResponse.json({ error: "请先确认注册协议。" }, { status: 400 });
  }
  const invite = body.mode === "register" && typeof body.invite === "string" ? body.invite.trim().toUpperCase() : "";
  if (invite && !GOOGLE_INVITE_CODE.test(invite)) return NextResponse.json({ error: "邀请码格式无效。" }, { status: 400 });
  try {
    // Missing signing configuration must stop invited signup before contacting Google.
    const intent = invite ? signGoogleSignupIntent(invite, process.env.AUTH_OAUTH_INTENT_SECRET) : null;
    const callback = new URL("/auth/callback", getAuthSiteOrigin(origin));
    callback.searchParams.set("next", getSafeInternalRedirect(typeof body.next === "string" ? body.next : null, "/account"));
    if (intent) {
      const registration = readGoogleSignupIntent(intent, process.env.AUTH_OAUTH_INTENT_SECRET);
      if (!registration) throw new Error("GOOGLE_SIGNUP_INTENT_UNAVAILABLE");
      callback.searchParams.set("signup_nonce", registration.nonce);
    }
    const { data, error } = await getSupabaseServerClient().auth.signInWithOAuth({
      provider: "google", options: { redirectTo: callback.toString(), skipBrowserRedirect: true },
    });
    if (error || !data.url) throw new Error("GOOGLE_START_FAILED");
    const response = NextResponse.json({ url: data.url });
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(GOOGLE_SIGNUP_COOKIE, intent ?? "", {
      httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", path: "/auth",
      maxAge: intent ? GOOGLE_SIGNUP_MAX_AGE : 0,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Google 登录暂时不可用，请使用邮箱登录。" }, { status: 503 });
  }
}
