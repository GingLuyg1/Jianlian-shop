import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function hasSupabaseServerConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getSupabaseServerClient() {
  if (!hasSupabaseServerConfig()) {
    throw new Error(
      "缺少 Supabase 环境变量：NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  const cookieStorePromise = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          return (await cookieStorePromise).getAll();
        },
        async setAll(cookiesToSet) {
          try {
            const store = await cookieStorePromise;
            cookiesToSet.forEach(({ name, value, options }) => {
              store.set(name, value, options);
            });
          } catch {
            // Server Components cannot set cookies. Middleware handles refresh.
          }
        },
      },
    }
  );
}
