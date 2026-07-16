import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

type AdminProfile = {
  role?: string | null;
};

type AdminAuthorization = {
  user_id: string;
  admin_level: "admin" | "super_admin";
  status: "active" | "disabled";
  permissions: Record<string, unknown>;
};

function isAdminProfile(profile: AdminProfile | null | undefined) {
  return profile?.role === "admin";
}

function isMissingAdminUsersSchema(error: { code?: string; message?: string } | null) {
  return Boolean(error && /42P01|PGRST205|admin_users|schema cache/i.test(`${error.code ?? ""} ${error.message ?? ""}`));
}

async function loadAdminAuthorization(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("admin_users")
    .select("user_id,admin_level,status,permissions")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    authorization: data as AdminAuthorization | null,
    error,
    schemaMissing: isMissingAdminUsersSchema(error),
  };
}

export async function getServerAdminContext(): Promise<
  | { ok: true; supabase: SupabaseClient; user: User; profile: AdminProfile; adminAuthorization: AdminAuthorization | null }
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

  const authorizationResult = await loadAdminAuthorization(supabase, user.id);
  if (authorizationResult.error && !authorizationResult.schemaMissing) {
    return { ok: false, status: 500, message: "无法验证后台权限" };
  }
  if (authorizationResult.authorization
      && (authorizationResult.authorization.status !== "active"
        || !["admin", "super_admin"].includes(authorizationResult.authorization.admin_level))) {
    return { ok: false, status: 403, message: "无后台访问权限" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return { ok: false, status: 500, message: "无法验证后台权限" };
  }

  if (!authorizationResult.authorization && !isAdminProfile(profile as AdminProfile | null)) {
    return { ok: false, status: 403, message: "无后台访问权限" };
  }

  return { ok: true, supabase, user, profile: profile as AdminProfile, adminAuthorization: authorizationResult.authorization };
}

export async function getServerSuperAdminContext(): Promise<
  | { ok: true; supabase: SupabaseClient; user: User; profile: AdminProfile; adminAuthorization: AdminAuthorization }
  | { ok: false; status: 401 | 403 | 500; message: string }
> {
  if (!hasSupabaseServerConfig()) return { ok: false, status: 500, message: "Supabase 环境变量未配置" };
  const supabase = getSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { ok: false, status: 401, message: "请先登录" };
  const result = await loadAdminAuthorization(supabase, user.id);
  if (result.error && !result.schemaMissing) {
    return { ok: false, status: 500, message: "无法验证超级管理员权限" };
  }
  if (!result.authorization || result.authorization.status !== "active" || result.authorization.admin_level !== "super_admin") {
    return { ok: false, status: 403, message: "无超级管理员权限" };
  }
  return { ok: true, supabase, user, profile: { role: "admin" }, adminAuthorization: result.authorization };
}
