import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  checkRateLimit,
  checkRequestSize,
  getRequestSourceKey,
  getUserRateLimitKey,
} from "@/lib/security/rate-limit";
import {
  generateAndSendEmailCode,
  type VerificationPurpose,
} from "@/lib/security/email-code-service";

export const dynamic = "force-dynamic";

function isGuestAccount(user: { email?: string | null; user_metadata?: Record<string, unknown> | null }) {
  return Boolean(
    user.user_metadata?.is_guest ||
      user.email?.toLowerCase().endsWith("@guest.jianlian.shop")
  );
}

export async function POST(request: Request) {
  try {
    const sizeError = checkRequestSize(request, 8 * 1024);
    if (sizeError) return sizeError;

    const ipLimit = checkRateLimit("auth_resend", `acct_sec:${getRequestSourceKey(request)}`);
    if (!ipLimit.allowed) return ipLimit.response!;

    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "登录已失效，请重新登录" }, { status: 401 });
    }

    if (isGuestAccount(user)) {
      return NextResponse.json({ error: "游客账号不支持安全验证操作，请先注册正式账号" }, { status: 403 });
    }

    const userLimit = checkRateLimit("auth_resend", getUserRateLimitKey(user.id, "acct_sec_send"));
    if (!userLimit.allowed) return userLimit.response!;

    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const purpose = body.purpose as VerificationPurpose;

    if (!email || email.length > 254 || !/^[^\s@%\\]+@[^\s@%\\]+\.[^\s@%\\]+$/.test(email)) {
      return NextResponse.json({ error: "请输入有效的邮箱地址" }, { status: 400 });
    }

    if (!["current_email_verify", "new_email_verify", "password_reset"].includes(purpose)) {
      return NextResponse.json({ error: "无效的验证场景" }, { status: 400 });
    }

    // For current_email_verify and password_reset, ensure it matches user's current registered email
    if (purpose === "current_email_verify" || purpose === "password_reset") {
      if (email !== user.email?.toLowerCase()) {
        return NextResponse.json({ error: "邮箱与当前登录账号不一致" }, { status: 400 });
      }
    }

    // For new_email_verify, ensure it's different from current email and not already in use
    if (purpose === "new_email_verify") {
      if (email === user.email?.toLowerCase()) {
        return NextResponse.json({ error: "新邮箱不能与当前绑定邮箱相同" }, { status: 400 });
      }
      const service = getSupabaseServiceRoleClient();
      if (service) {
        // Check if new email is already registered in profiles or auth
        const { data: existingProfile } = await service
          .from("profiles")
          .select("id")
          .eq("email", email)
          .maybeSingle();

        if (existingProfile) {
          return NextResponse.json({ error: "该邮箱已被其他账号绑定，请更换" }, { status: 400 });
        }
      }
    }

    const result = await generateAndSendEmailCode(email, purpose);
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: result.message || "验证码已成功发送",
    });
  } catch (err: any) {
    console.error("[AccountSecuritySendCode] error:", err);
    return NextResponse.json({ error: "发送验证码失败，请稍后重试" }, { status: 500 });
  }
}
