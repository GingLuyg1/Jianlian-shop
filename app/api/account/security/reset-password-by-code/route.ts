import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { verifyEmailCode } from "@/lib/security/email-code-service";

export const dynamic = "force-dynamic";

function validatePassword(value: string) {
  if (value.length < 8) return "新密码长度至少 8 位";
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    return "新密码需同时包含字母和数字";
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || !user.email) {
      return NextResponse.json({ error: "登录已失效，请重新登录" }, { status: 401 });
    }

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
      console.error("[AccountSecurityResetPassword] admin update password error:", updateError);
      return NextResponse.json({ error: `密码修改失败：${updateError.message || "请稍后重试"}` }, { status: 400 });
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
