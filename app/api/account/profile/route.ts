import { NextResponse } from "next/server";

import { getAuditErrorMessage } from "@/lib/admin/audit-log-service";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { assertUserBusinessAllowed, isAccountRestrictionError } from "@/lib/users/account-guard";

export const dynamic = "force-dynamic";

type ProfilePayload = {
  display_name?: string;
  phone?: string | null;
  country?: string | null;
  recipient_name?: string | null;
  shipping_address?: Record<string, unknown> | null;
  avatar_url?: string | null;
};

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, init);
}

function cleanText(value: unknown, max = 200) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export async function PATCH(request: Request) {
  if (!hasSupabaseServerConfig()) {
    return json({ error: "Supabase 环境变量未配置。" }, { status: 500 });
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return json({ error: "请先登录。" }, { status: 401 });
  }

  try {
    await assertUserBusinessAllowed(supabase, user.id, "update_profile");
  } catch (guardError) {
    if (isAccountRestrictionError(guardError)) {
      return json({ error: guardError.message, code: guardError.code }, { status: guardError.status });
    }
    throw guardError;
  }

  const body = (await request.json().catch(() => null)) as ProfilePayload | null;
  if (!body) return json({ error: "请求参数不正确。" }, { status: 400 });

  const displayName = cleanText(body.display_name, 80);
  if (!displayName) return json({ error: "显示名称不能为空。" }, { status: 400 });

  const payload = {
    display_name: displayName,
    phone: cleanText(body.phone, 40),
    country: cleanText(body.country, 80),
    recipient_name: cleanText(body.recipient_name, 80),
    shipping_address: body.shipping_address && typeof body.shipping_address === "object" ? body.shipping_address : null,
    avatar_url: cleanText(body.avatar_url, 1000),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", user.id)
    .select("email,display_name,phone,country,recipient_name,shipping_address,avatar_url,updated_at")
    .maybeSingle();

  if (error) {
    console.error("[Account Profile] save failed", { code: error.code, message: getAuditErrorMessage(error, "") });
    return json({ error: "资料保存失败，请检查填写内容后重试。" }, { status: 500 });
  }

  if (!data) return json({ error: "资料保存失败，未找到当前用户。" }, { status: 404 });
  return json({ profile: data });
}
