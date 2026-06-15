import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export type UserRole = "user" | "admin" | "support" | "finance";

export type UserProfile = {
  id: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  balance: number;
  created_at: string;
  updated_at: string;
};

type SupabaseConfigStatus = {
  ok: boolean;
  url?: string;
  anonKey?: string;
  message?: string;
};

let browserClient: SupabaseClient | null = null;

export function getSupabaseConfigStatus(): SupabaseConfigStatus {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return {
      ok: false,
      message:
        "Supabase URL 或 Key 未配置，请检查 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY。",
    };
  }

  try {
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return {
        ok: false,
        message:
          "Supabase URL 格式不正确，必须以 http:// 或 https:// 开头。",
      };
    }
  } catch {
    return {
      ok: false,
      message: "Supabase URL 格式不正确，请检查 NEXT_PUBLIC_SUPABASE_URL。",
    };
  }

  return {
    ok: true,
    url,
    anonKey,
  };
}

export function hasSupabaseConfig() {
  return getSupabaseConfigStatus().ok;
}

export function getSupabaseBrowserClient() {
  const config = getSupabaseConfigStatus();

  if (!config.ok || !config.url || !config.anonKey) {
    const message =
      config.message ?? "Supabase URL 或 Key 未配置，请检查环境变量。";
    console.error("[Supabase Auth]", message);
    throw new Error(message);
  }

  if (!browserClient) {
    browserClient = createBrowserClient(config.url, config.anonKey);
  }

  return browserClient;
}

export function userToProfile(user: User): UserProfile {
  const timestamp = user.created_at || new Date().toISOString();

  return {
    id: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
    role: "user",
    balance: 0,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export async function getCurrentProfile() {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return userToProfile(user);
}
