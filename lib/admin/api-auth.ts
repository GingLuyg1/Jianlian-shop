import "server-only";

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type AdminProfile = {
  role?: string | null;
  email?: string | null;
};

export type AdminAuthorization = {
  user_id: string;
  admin_level: "admin" | "super_admin";
  status: "active" | "disabled";
  permissions: Record<string, unknown>;
};

function permissionError(message: string, status: 401 | 403 | 500 | 503) {
  return NextResponse.json({ error: message, request_id: randomUUID() }, { status });
}

export function isAdminProfile(profile: AdminProfile | null | undefined) {
  return profile?.role === "admin";
}

function isMissingAdminUsersSchema(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const code = String(error.code ?? "").trim().toUpperCase();
  if (code === "42P01" || code === "PGRST205") return true;
  const message = String(error.message ?? "");
  return /(?:relation|table) .*admin_users.* does not exist|Could not find the table .*admin_users.* in the schema cache/i.test(message);
}

async function loadAdminAuthorization(supabase: ReturnType<typeof getSupabaseServerClient>, userId: string) {
  // Always read admin_users via service role when available so disabled rows
  // are explicitly returned and never bypassed via RLS.
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

export async function requireApiUser() {
  if (!hasSupabaseServerConfig()) {
    return { ok: false as const, response: permissionError("Supabase 环境变量未配置", 503) };
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false as const, response: permissionError("请先登录", 401) };
  }

  return { ok: true as const, supabase, user };
}

export async function requireApiAdmin() {
  const userContext = await requireApiUser();
  if (!userContext.ok) return userContext;

  const [authorizationResult, profileResult] = await Promise.all([
    loadAdminAuthorization(userContext.supabase, userContext.user.id),
    userContext.supabase
      .from("profiles")
      .select("role,email")
      .eq("id", userContext.user.id)
      .maybeSingle(),
  ]);

  if (authorizationResult.error && !authorizationResult.schemaMissing) {
    return { ok: false as const, response: permissionError("无法验证后台权限，请重新登录", 500) };
  }

  const authorization = authorizationResult.authorization;
  if (authorization) {
    if (authorization.status !== "active" || !["admin", "super_admin"].includes(authorization.admin_level)) {
      return { ok: false as const, response: permissionError("无后台访问权限", 403) };
    }
  }

  if (profileResult.error) {
    return { ok: false as const, response: permissionError("无法验证后台权限，请重新登录", 500) };
  }

  const data = profileResult.data;

  // Strictly only allow legacy profiles.role fallback when admin_users table
  // is genuinely absent (42P01 / PGRST205).
  if (!authorization) {
    if (!authorizationResult.schemaMissing || !isAdminProfile(data)) {
      return { ok: false as const, response: permissionError("无后台访问权限", 403) };
    }
  }

  return {
    ok: true as const,
    supabase: userContext.supabase,
    user: userContext.user,
    profile: data,
    adminAuthorization: authorization,
  };
}

export async function requireApiSuperAdmin() {
  const userContext = await requireApiUser();
  if (!userContext.ok) return userContext;
  const result = await loadAdminAuthorization(userContext.supabase, userContext.user.id);
  if (result.error && !result.schemaMissing) {
    return { ok: false as const, response: permissionError("无法验证超级管理员权限", 500) };
  }
  if (!result.authorization || result.authorization.status !== "active" || result.authorization.admin_level !== "super_admin") {
    return { ok: false as const, response: permissionError("无超级管理员权限", 403) };
  }
  return {
    ok: true as const,
    supabase: userContext.supabase,
    user: userContext.user,
    profile: { role: "admin", email: userContext.user.email ?? null },
    adminAuthorization: result.authorization,
  };
}
