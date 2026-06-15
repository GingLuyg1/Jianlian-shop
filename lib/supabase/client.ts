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

let browserClient: SupabaseClient | null = null;

export function hasSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getSupabaseBrowserClient() {
  if (!hasSupabaseConfig()) {
    throw new Error(
      "缺少 Supabase 环境变量：NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
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
