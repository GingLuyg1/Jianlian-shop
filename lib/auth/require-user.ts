import { redirect } from "next/navigation";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export async function requireUser(redirectTo = "/login") {
  if (!hasSupabaseServerConfig()) {
    redirect(redirectTo);
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect(redirectTo);
  }

  return { supabase, user };
}
