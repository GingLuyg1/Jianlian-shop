import { NextResponse, type NextRequest } from "next/server";

import { getSafeInternalRedirect } from "@/lib/auth/redirect";
import {
  getSupabaseServerClient,
  hasSupabaseServerConfig,
} from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = getSafeInternalRedirect(
    requestUrl.searchParams.get("next") ??
      requestUrl.searchParams.get("redirect") ??
      requestUrl.searchParams.get("returnTo"),
    "/account"
  );

  if (!hasSupabaseServerConfig()) {
    return NextResponse.redirect(
      new URL("/login?auth_error=config", requestUrl.origin)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?auth_error=invalid_link", requestUrl.origin)
    );
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL("/login?auth_error=invalid_link", requestUrl.origin)
    );
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}

