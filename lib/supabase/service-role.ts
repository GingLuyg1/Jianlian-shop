import "server-only";

import { createClient } from "@supabase/supabase-js";

type ServiceRoleKeyType = "secret" | "jwt" | "unknown";

function getConfiguredServiceRoleKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SECRET ??
    process.env.SUPABASE_SERVICE_KEY ??
    ""
  ).trim();
}

function readJwtRole(key: string) {
  if (!key.startsWith("eyJ")) return null;

  try {
    const payload = key.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as { role?: unknown };
    return typeof decoded.role === "string" ? decoded.role : null;
  } catch {
    return null;
  }
}

export function getSupabaseServiceRoleConfiguration() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const serviceRoleKey = getConfiguredServiceRoleKey();
  const keyType: ServiceRoleKeyType = serviceRoleKey.startsWith("sb_secret_")
    ? "secret"
    : serviceRoleKey.startsWith("eyJ")
      ? "jwt"
      : "unknown";
  const jwtRole = keyType === "jwt" ? readJwtRole(serviceRoleKey) : null;
  const valid = Boolean(supabaseUrl && serviceRoleKey) && (keyType === "secret" || jwtRole === "service_role");

  return {
    urlPresent: Boolean(supabaseUrl),
    serviceRolePresent: Boolean(serviceRoleKey),
    keyType,
    jwtRole,
    valid,
  } as const;
}

export function getSupabaseServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const serviceRoleKey = getConfiguredServiceRoleKey();
  const configuration = getSupabaseServiceRoleConfiguration();

  if (!configuration.valid) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
