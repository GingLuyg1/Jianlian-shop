import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  checkRateLimit,
  checkRequestSize,
  getRequestSourceKey,
  getUserRateLimitKey,
} from "@/lib/security/rate-limit";
import { verifyEmailCode } from "@/lib/security/email-code-service";

export const dynamic = "force-dynamic";

function validatePassword(value: string) {
  if (value.length < 8) return "新密码长度至少 8 位";
  return null;
}

export async function POST(request: Request) {
  try {
    const sizeError = checkRequestSize(request, 8 * 1024);
    if (sizeError) return sizeError;

    const ipLimit = checkRateLimit("auth_resend", `reset_pw:${getRequestSourceKey(request)}`);
    if (!ipLimit.allowed) return ipLimit.response!;

    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || !user.email) {
      return NextResponse.json({ error: "登录已失效，请重新登录" }, { status: 401 });
    }

    if (user.user_metadata?.is_guest || user.email.toLowerCase().endsWith("@guest.jianlian.shop")) {
      return NextResponse.json({ error: "游客账号不支持修改密码，请先注册正式账号" }, { status: 403 });
    }

    const userLimit = checkRateLimit("auth_resend", getUserRateLimitKey(user.id, "reset_pw"));
    if (!userLimit.allowed) return userLimit.response!;

    const body = await request.json().catch(() => ({}));
    const code = String(body.code || "").trim();
    const newPassword = String(body.newPassword || "");
    const confirmPassword = String(body.confirmPassword || "");

    if (!code) {
      return NextResponse.json({ error: "请输入收到的邮箱验证码" }, { status: 400 });
    }

    const passError = validatePassword(newPassword);
    if (passError) {
      return NextResponse.json({ error: passError }, { status: 400 });
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: "两次输入的新密码不一致" }, { status: 400 });
    }

    // Verify email verification code
    const verifyResult = verifyEmailCode(user.email, "password_reset", code);
    if (!verifyResult.valid) {
      return NextResponse.json({ error: verifyResult.message }, { status: 400 });
    }

    // Update password via service role admin API
    const service = getSupabaseServiceRoleClient();
    if (!service) {
      return NextResponse.json({ error: "服务暂不可用，请稍后重试" }, { status: 500 });
    }

    const { error: updateError } = await service.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });

    if (updateError) {
      console.error("[AccountSecurityResetPassword] admin update password error:", updateError.message);
      return NextResponse.json({ error: "密码修改失败，请检查密码强度后重试" }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: "密码已成功修改，请使用新密码重新登录",
    });
  } catch (err: any) {
    console.error("[AccountSecurityResetPassword] error:", err);
    return NextResponse.json({ error: "重置密码异常，请稍后重试" }, { status: 500 });
  }
}
