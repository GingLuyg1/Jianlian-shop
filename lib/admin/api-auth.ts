import "server-only";

import { NextResponse } from "next/server";

import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export async function requireApiUser() {
  if (!hasSupabaseServerConfig()) {
    return { ok: false as const, response: NextResponse.json({ error: "Supabase 环境变量未配置" }, { status: 503 }) };
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false as const, response: NextResponse.json({ error: "请先登录" }, { status: 401 }) };
  }

  return { ok: true as const, supabase, user };
}

export async function requireApiAdmin() {
  const userContext = await requireApiUser();
  if (!userContext.ok) return userContext;

  const { data, error } = await userContext.supabase
    .from("profiles")
    .select("role,email")
    .eq("id", userContext.user.id)
    .maybeSingle();

  if (error) {
    return { ok: false as const, response: NextResponse.json({ error: "无法验证后台权限，请重新登录" }, { status: 500 }) };
  }

  if (data?.role !== "admin") {
    return { ok: false as const, response: NextResponse.json({ error: "无后台访问权限" }, { status: 403 }) };
  }

  return { ok: true as const, supabase: userContext.supabase, user: userContext.user, profile: data };
}
