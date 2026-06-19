import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export async function getServerAdminContext(): Promise<
  | { ok: true; supabase: SupabaseClient; user: User }
  | { ok: false; status: 401 | 403 | 500; message: string }
> {
  if (!hasSupabaseServerConfig()) {
    return { ok: false, status: 500, message: "Supabase 环境变量未配置" };
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, status: 401, message: "请先登录" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return { ok: false, status: 500, message: "无法验证后台权限" };
  }

  if ((profile as { role?: string } | null)?.role !== "admin") {
    return { ok: false, status: 403, message: "无后台访问权限" };
  }

  return { ok: true, supabase, user };
}
