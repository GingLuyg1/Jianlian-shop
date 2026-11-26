import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { checkRateLimit, checkRequestSize, getRequestSourceKey } from "@/lib/security/rate-limit";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const GUEST_EMAIL_DOMAIN = "guest.jianlian.shop";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  try {
    if (!hasSupabaseServerConfig()) {
      return NextResponse.json({ error: "服务配置未就绪，请稍后重试" }, { status: 503 });
    }

    const sizeError = checkRequestSize(request, 4 * 1024);
    if (sizeError) return sizeError;

    const rateLimit = checkRateLimit("order_create", `guest_session:${getRequestSourceKey(request)}`);
    if (!rateLimit.allowed) return rateLimit.response!;

    const body = (await request.json().catch(() => null)) as { email?: string } | null;
    const contactEmail = String(body?.email ?? "").trim().toLowerCase();
    if (!contactEmail || !isValidEmail(contactEmail) || contactEmail.length > 160) {
      return NextResponse.json({ error: "请输入有效的接收邮箱后再下单" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const {
      data: { user: existingUser },
    } = await supabase.auth.getUser();

    if (existingUser) {
      return NextResponse.json({
        ok: true,
        isGuest: Boolean(
          existingUser.user_metadata?.is_guest ||
            existingUser.email?.endsWith(`@${GUEST_EMAIL_DOMAIN}`)
        ),
      });
    }

    const service = getSupabaseServiceRoleClient();
    if (!service) {
      return NextResponse.json({ error: "游客下单通道暂未就绪，请登录后购买" }, { status: 503 });
    }

    const guestId = randomUUID().replace(/-/g, "").slice(0, 16);
    const syntheticEmail = `guest_${guestId}@${GUEST_EMAIL_DOMAIN}`;
    const syntheticPassword = `G!${randomBytes(24).toString("base64url")}9a`;

    const { data: created, error: createError } = await service.auth.admin.createUser({
      email: syntheticEmail,
      password: syntheticPassword,
      email_confirm: true,
      user_metadata: {
        is_guest: true,
        contact_email: contactEmail,
      },
    });

    if (createError || !created?.user) {
      console.error("[GuestSession] createUser failed", createError?.message ?? "unknown");
      return NextResponse.json({ error: "创建游客会话失败，请稍后重试或登录购买" }, { status: 500 });
    }

    // Best-effort profile bootstrap so all downstream profile checks work smoothly.
    await service
      .from("profiles")
      .upsert(
        {
          id: created.user.id,
          email: syntheticEmail,
          display_name: `游客 (${contactEmail.slice(0, 48)})`,
          role: "user",
        },
        { onConflict: "id" }
      )
      .then(() => undefined, () => undefined);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: syntheticEmail,
      password: syntheticPassword,
    });

    if (signInError) {
      console.error("[GuestSession] signInWithPassword failed", signInError.message);
      return NextResponse.json({ error: "游客会话初始化失败，请重试" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, isGuest: true });
  } catch (error) {
    console.error("[GuestSession] unexpected error", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "游客下单初始化失败，请稍后重试" }, { status: 500 });
  }
}
