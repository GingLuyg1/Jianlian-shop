import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type AdminProfile = {
  role?: string | null;
};

type AdminAuthorization = {
  user_id: string;
  admin_level: "admin" | "super_admin";
  status: "active" | "disabled";
  permissions: Record<string, unknown>;
};

type AdminCapability = "orders.write" | "delivery.manual" | "inventory.write" | "reports.export";

export function hasAdminCapability(authorization: AdminAuthorization | null, capability: AdminCapability) {
  return authorization?.status === "active" && (authorization.admin_level === "super_admin" || authorization.permissions?.[capability] === true);
}

function isAdminProfile(profile: AdminProfile | null | undefined) {
  return profile?.role === "admin";
}

function isMissingAdminUsersSchema(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const code = String(error.code ?? "").trim().toUpperCase();
  if (code === "42P01" || code === "PGRST205") return true;
  const message = String(error.message ?? "");
  return /(?:relation|table) .*admin_users.* does not exist|Could not find the table .*admin_users.* in the schema cache/i.test(message);
}

async function loadAdminAuthorization(supabase: SupabaseClient, userId: string) {
  // Always read admin_users via service role when available so disabled rows
  // can never be hidden by user-scoped RLS policies.
  const reader = getSupabaseServiceRoleClient() ?? supabase;
  const { data, error } = await reader
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

export async function getServerAdminContext(requiredCapability?: AdminCapability): Promise<
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

  const [authorizationResult, profileResult] = await Promise.all([
    loadAdminAuthorization(supabase, user.id),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);

  if (authorizationResult.error && !authorizationResult.schemaMissing) {
    return { ok: false, status: 500, message: "无法验证后台权限" };
  }
  if (
    authorizationResult.authorization &&
    (authorizationResult.authorization.status !== "active" ||
      !["admin", "super_admin"].includes(authorizationResult.authorization.admin_level))
  ) {
    return { ok: false, status: 403, message: "无后台访问权限" };
  }

  if (profileResult.error) {
    return { ok: false, status: 500, message: "无法验证后台权限" };
  }

  const profile = profileResult.data as AdminProfile | null;

  // Strictly only allow legacy profiles.role fallback when the admin_users table
  // itself does not exist (42P01 / PGRST205). Never fall back when admin_users exists.
  if (!authorizationResult.authorization) {
    if (!authorizationResult.schemaMissing || !isAdminProfile(profile)) {
      return { ok: false, status: 403, message: "无后台访问权限" };
    }
  }

  const authorization = authorizationResult.authorization;
  if (requiredCapability && !hasAdminCapability(authorization, requiredCapability)) {
    return { ok: false, status: 403, message: "无此模块的操作权限" };
  }

  return { ok: true, supabase, user, profile: profile as AdminProfile, adminAuthorization: authorization };
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
