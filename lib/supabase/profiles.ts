import type { SupabaseClient, User } from "@supabase/supabase-js";

export type UserRole = "user" | "admin" | "support" | "finance";

export type UserProfile = {
  id: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  balance: number;
  promotion_balance: number;
  invite_code: string | null;
  referred_by: string | null;
  created_at: string;
  updated_at: string;
};

const ADMIN_EMAILS = new Set(["gac000189@gmail.com"]);

function getRoleForEmail(email: string | null | undefined): UserRole {
  return email && ADMIN_EMAILS.has(email.toLowerCase()) ? "admin" : "user";
}

function normalizeProfile(row: Partial<UserProfile>, user: User): UserProfile {
  const timestamp = user.created_at || new Date().toISOString();

  return {
    id: row.id ?? user.id,
    email: row.email ?? user.email ?? null,
    phone: row.phone ?? user.phone ?? null,
    role: row.role ?? getRoleForEmail(user.email),
    balance: Number(row.balance ?? 0),
    promotion_balance: Number(row.promotion_balance ?? 0),
    invite_code: row.invite_code ?? null,
    referred_by: row.referred_by ?? null,
    created_at: row.created_at ?? timestamp,
    updated_at: row.updated_at ?? timestamp,
  };
}

export function userToProfile(user: User): UserProfile {
  return normalizeProfile({}, user);
}

export async function getOrCreateProfile(
  supabase: SupabaseClient,
  user: User
) {
  const { data: existingProfile, error: selectError } = await supabase
    .from("profiles")
    .select(
      "id,email,phone,role,balance,promotion_balance,invite_code,referred_by,created_at,updated_at"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfile) {
    return normalizeProfile(existingProfile, user);
  }

  if (selectError) {
    console.error("[Supabase Auth] Failed to load profile", selectError);
  }

  const profilePayload = {
    id: user.id,
    email: user.email?.toLowerCase() ?? null,
    role: getRoleForEmail(user.email),
    balance: 0,
    promotion_balance: 0,
  };

  const { data: createdProfile, error: insertError } = await supabase
    .from("profiles")
    .insert(profilePayload)
    .select(
      "id,email,phone,role,balance,promotion_balance,invite_code,referred_by,created_at,updated_at"
    )
    .single();

  if (insertError) {
    console.error("[Supabase Auth] Failed to create profile", insertError);
    return userToProfile(user);
  }

  return normalizeProfile(createdProfile, user);
}
