import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  checkRateLimit,
  checkRequestSize,
  getRequestSourceKey,
  getUserRateLimitKey,
} from "@/lib/security/rate-limit";
import { consumeEmailCode, peekEmailCode } from "@/lib/security/email-code-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const sizeError = checkRequestSize(request, 8 * 1024);
    if (sizeError) return sizeError;

    const ipLimit = checkRateLimit("auth_resend", `change_email:${getRequestSourceKey(request)}`);
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
      return NextResponse.json({ error: "游客账号不支持更换邮箱，请先注册正式账号" }, { status: 403 });
    }

    const userLimit = checkRateLimit("auth_resend", getUserRateLimitKey(user.id, "change_email"));
    if (!userLimit.allowed) return userLimit.response!;

    const body = await request.json().catch(() => ({}));
    const currentCode = String(body.currentCode || "").trim();
    const newEmail = String(body.newEmail || "").trim().toLowerCase();
    const newCode = String(body.newCode || "").trim();

    if (!currentCode) {
      return NextResponse.json({ error: "请输入当前邮箱收到的验证码" }, { status: 400 });
    }
    if (!newEmail || newEmail.length > 254 || !/^[^\s@%\\]+@[^\s@%\\]+\.[^\s@%\\]+$/.test(newEmail)) {
      return NextResponse.json({ error: "请输入正确的新邮箱地址" }, { status: 400 });
    }
    if (newEmail === user.email.toLowerCase()) {
      return NextResponse.json({ error: "新邮箱不能与当前邮箱相同" }, { status: 400 });
    }
    if (!newCode) {
      return NextResponse.json({ error: "请输入新邮箱收到的验证码" }, { status: 400 });
    }

    // Verify both codes before consuming either so a typo in newCode doesn't burn currentCode
    const currentVerify = peekEmailCode(user.email, "current_email_verify", currentCode);
    if (!currentVerify.valid) {
      return NextResponse.json({ error: `当前邮箱${currentVerify.message}` }, { status: 400 });
    }

    const newVerify = peekEmailCode(newEmail, "new_email_verify", newCode);
    if (!newVerify.valid) {
      return NextResponse.json({ error: `新邮箱${newVerify.message}` }, { status: 400 });
    }

    consumeEmailCode(user.email, "current_email_verify");
    consumeEmailCode(newEmail, "new_email_verify");

    // 3. Perform email update using service role
    const service = getSupabaseServiceRoleClient();
    if (!service) {
      return NextResponse.json({ error: "系统服务暂不可用，请稍后重试" }, { status: 500 });
    }

    // Check if new email taken
    const { data: existingUser } = await service
      .from("profiles")
      .select("id")
      .eq("email", newEmail)
      .maybeSingle();

    if (existingUser && existingUser.id !== user.id) {
      return NextResponse.json({ error: "该新邮箱已被其他账号使用，请更换" }, { status: 400 });
    }

    const { error: updateAuthError } = await service.auth.admin.updateUserById(user.id, {
      email: newEmail,
      email_confirm: true,
    });

    if (updateAuthError) {
      console.error("[AccountSecurityChangeEmail] auth update error:", updateAuthError.message);
      return NextResponse.json({ error: "邮箱更新失败，请确认新邮箱未被占用后重试" }, { status: 400 });
    }

    // Update profile record if exists
    await service
      .from("profiles")
      .update({ email: newEmail, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    return NextResponse.json({
      ok: true,
      email: newEmail,
      message: "绑定邮箱更换成功！",
    });
  } catch (err: any) {
    console.error("[AccountSecurityChangeEmail] error:", err);
    return NextResponse.json({ error: "更换邮箱异常，请稍后重试" }, { status: 500 });
  }
}
