import { NextResponse, type NextRequest } from "next/server";
import { getSafeInternalRedirect } from "@/lib/auth/redirect";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { GOOGLE_SIGNUP_COOKIE, readGoogleSignupIntent, isGoogleSignupAfterIntent } from "@/lib/auth/google-signup-intent";

function finish(response: NextResponse) {
  response.cookies.set(GOOGLE_SIGNUP_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/auth", maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function loginError(requestUrl: URL, reason: "config" | "invalid_link" | "restricted" | "invite") {
  const target = new URL("/login", requestUrl.origin);
  target.searchParams.set("auth_error", reason);
  return finish(NextResponse.redirect(target));
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
  try {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      await supabase.auth.signOut();
      return loginError(requestUrl, "invalid_link");
    }

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

    // A recently created returning account is NOT a new signup. Only a signed,
    // same-browser registration intent predating the Auth server's creation time qualifies.
    const value = request.cookies.get(GOOGLE_SIGNUP_COOKIE)?.value;
    const intent = value ? readGoogleSignupIntent(value, process.env.AUTH_OAUTH_INTENT_SECRET) : null;
    if (value && (!intent || requestUrl.searchParams.get("signup_nonce") !== intent.nonce)) {
      await supabase.auth.signOut();
      return loginError(requestUrl, "invite");
    }
    const isGoogle = user.app_metadata?.provider === "google"
      || user.identities?.some(identity => identity.provider === "google");
    if (intent && isGoogle && isGoogleSignupAfterIntent(user.created_at, intent)) {
      const { error: bindError } = await supabase.rpc("bind_referrer_by_code", {
        input_invite_code: intent.invite,
      });
      if (bindError) {
        await supabase.auth.signOut();
        return loginError(requestUrl, "invite");
      }
    }

    return finish(NextResponse.redirect(new URL(next, requestUrl.origin)));
  } catch {
    await supabase.auth.signOut().catch(() => undefined);
    return loginError(requestUrl, "restricted");
  }
}
