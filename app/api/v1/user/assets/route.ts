import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { code: 401, message: "Unauthorized. Please provide a valid Bearer token or login session." },
        { status: 401 }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("balance, account_status, created_at")
      .eq("id", user.id)
      .maybeSingle();

    return NextResponse.json({
      code: 200,
      message: "success",
      timestamp: Date.now(),
      data: {
        userId: user.id,
        email: user.email,
        balance: profile?.balance ?? 0,
        currency: "CNY",
        rateLimit: {
          limitPerMinute: 60,
          remaining: 59,
        },
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { code: 500, message: "Internal server error", error: message },
      { status: 500 }
    );
  }
}
