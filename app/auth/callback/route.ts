import { NextResponse, type NextRequest } from "next/server";
import { getSafeInternalRedirect } from "@/lib/auth/redirect";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

const INVITE_CODE = /^JL[A-Z0-9]{6,12}$/i;

function loginError(requestUrl: URL, reason: "config" | "invalid_link" | "restricted" | "invite") {
  const target = new URL("/login", requestUrl.origin);
  target.searchParams.set("auth_error", reason);
  return NextResponse.redirect(target);
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = getSafeInternalRedirect(
    requestUrl.searchParams.get("next") ??
      requestUrl.searchParams.get("redirect") ??
      requestUrl.searchParams.get("returnTo"),
    "/account"
  );

  if (!hasSupabaseServerConfig()) return loginError(requestUrl, "config");
  if (!code) return loginError(requestUrl, "invalid_link");

  const supabase = getSupabaseServerClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) return loginError(requestUrl, "invalid_link");

  // OTP, Google and password login must respect the same real account locks.
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    await supabase.auth.signOut();
    return loginError(requestUrl, "restricted");
  }
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("account_status,risk_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.account_status === "disabled" || profile.risk_status === "blocked") {
    await supabase.auth.signOut();
    return loginError(requestUrl, "restricted");
  }

  // Registration via invited Google OAuth redirects through this route.
  // Database RPC handles referral ownership/self-referral and repeat binding.
  const invite = requestUrl.searchParams.get("invite")?.trim().toUpperCase() ?? "";
  const createdAtMs = Date.parse(user.created_at);
  const isNewSignup = Number.isFinite(createdAtMs) &&
    Date.now() >= createdAtMs && Date.now() - createdAtMs <= 15 * 60 * 1000;
  if (isNewSignup && INVITE_CODE.test(invite)) {
    const { error: bindError } = await supabase.rpc("bind_referrer_by_code", {
      input_invite_code: invite,
    });
    if (bindError) {
      await supabase.auth.signOut();
      return loginError(requestUrl, "invite");
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
