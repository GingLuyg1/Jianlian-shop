import type { User } from "@supabase/supabase-js";

const GUEST_EMAIL_SUFFIX = "@guest.jianlian.shop";

export function isGuestAuthUser(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.user_metadata?.is_guest === true) return true;
  if (typeof user.email === "string" && user.email.toLowerCase().endsWith(GUEST_EMAIL_SUFFIX)) {
    return true;
  }
  return false;
}
