import { createClient, SupabaseClient } from "@supabase/supabase-js";

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
    browserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }
    );
  }

  return browserClient;
}

export async function getCurrentProfile() {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,phone,role,balance,created_at,updated_at")
    .eq("id", user.id)
    .single<UserProfile>();

  if (error) {
    throw error;
  }

  return data;
}
