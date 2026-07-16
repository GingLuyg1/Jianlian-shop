import type { SupabaseClient, User } from "@supabase/supabase-js";

export type UserRole = "user" | "admin" | "support" | "finance";

export type UserProfile = {
  id: string;
  email: string | null;
  phone: string | null;
  display_name: string | null;
  recipient_name: string | null;
  shipping_address: Record<string, unknown> | null;
  avatar_url: string | null;
  role: UserRole;
  balance: number;
  promotion_balance: number;
  invite_code: string | null;
  referred_by: string | null;
  created_at: string;
  updated_at: string;
};

export type UserProfileInsert = {
  id: string;
  email: string | null;
  phone?: string | null;
  role: UserRole;
  balance: number;
  promotion_balance: number;
};

export type UserProfileUpdate = {
  display_name?: string | null;
  phone?: string | null;
  recipient_name?: string | null;
  shipping_address?: Record<string, unknown>;
  avatar_url?: string | null;
};

function getRoleForEmail(_email: string | null | undefined): UserRole {
  return "user";
}

const PROFILE_SELECT_FIELDS =
  "id,email,phone,role,balance,promotion_balance,invite_code,referred_by,created_at,updated_at";

const PROFILE_EXTENDED_SELECT_FIELDS =
  "id,email,phone,display_name,recipient_name,shipping_address,avatar_url,role,balance,promotion_balance,invite_code,referred_by,created_at,updated_at";

const profileCreateInFlight = new Map<string, Promise<UserProfile>>();
const profileCreateFailures = new Set<string>();

function normalizeProfile(row: Partial<UserProfile>, user: User): UserProfile {
  const timestamp = user.created_at || new Date().toISOString();

  return {
    id: row.id ?? user.id,
    email: row.email ?? user.email ?? null,
    phone: row.phone ?? user.phone ?? null,
    display_name: row.display_name ?? null,
    recipient_name: row.recipient_name ?? null,
    shipping_address:
      row.shipping_address && typeof row.shipping_address === "object"
        ? row.shipping_address
        : null,
    avatar_url: row.avatar_url ?? null,
    role: row.role ?? getRoleForEmail(user.email),
    balance: Number(row.balance ?? 0),
    promotion_balance: Number(row.promotion_balance ?? 0),
    invite_code: row.invite_code ?? null,
    referred_by: row.referred_by ?? null,
    created_at: row.created_at ?? timestamp,
    updated_at: row.updated_at ?? timestamp,
  };
}

function isMissingProfileColumn(error: unknown) {
  const next = (error ?? {}) as { code?: unknown; message?: unknown; details?: unknown };
  const text = `${typeof next.message === "string" ? next.message : ""} ${typeof next.details === "string" ? next.details : ""}`;
  return next.code === "42703" || /column .* does not exist/i.test(text);
}

export function userToProfile(user: User): UserProfile {
  return normalizeProfile({}, user);
}

export async function getOrCreateProfile(
  supabase: SupabaseClient,
  user: User
) {
  const inFlight = profileCreateInFlight.get(user.id);
  if (inFlight) return inFlight;

  let { data: existingProfile, error: selectError } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT_FIELDS)
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfile) {
    return normalizeProfile(existingProfile, user);
  }

  if (selectError) {
    console.error("[Supabase Auth] Failed to load profile", {
      code: selectError.code,
      message: selectError.message,
    });
    return userToProfile(user);
  }

  if (profileCreateFailures.has(user.id)) {
    return userToProfile(user);
  }

  const profilePayload: UserProfileInsert = {
    id: user.id,
    email: user.email?.toLowerCase() ?? null,
    phone: user.phone ?? null,
    role: "user",
    balance: 0,
    promotion_balance: 0,
  };

  const createPromise = Promise.resolve(
    supabase
      .from("profiles")
      .insert(profilePayload)
      .select(PROFILE_SELECT_FIELDS)
      .maybeSingle()
  ).then(({ data: createdProfile, error: insertError }) => {
      if (insertError) {
        if (insertError.code === "23505") {
          return supabase
            .from("profiles")
            .select(PROFILE_SELECT_FIELDS)
            .eq("id", user.id)
            .maybeSingle()
            .then(({ data: retryProfile, error: retryError }) => {
              if (retryProfile && !retryError) return normalizeProfile(retryProfile, user);
              profileCreateFailures.add(user.id);
              return userToProfile(user);
            });
        }

        console.error("[Supabase Auth] Failed to create profile", {
          code: insertError.code,
          message: insertError.message,
        });
        profileCreateFailures.add(user.id);
        return userToProfile(user);
      }
      if (!createdProfile) return userToProfile(user);
      return normalizeProfile(createdProfile, user);
    })
    .finally(() => {
      profileCreateInFlight.delete(user.id);
    });

  profileCreateInFlight.set(user.id, createPromise);
  return createPromise;
}

export async function loadCurrentProfile(
  supabase: SupabaseClient,
  user: User
) {
  const extended = await supabase
    .from("profiles")
    .select(PROFILE_EXTENDED_SELECT_FIELDS)
    .eq("id", user.id)
    .maybeSingle();

  if (!extended.error) {
    if (extended.data) return normalizeProfile(extended.data, user);
    return null;
  }

  if (!isMissingProfileColumn(extended.error)) {
    throw extended.error;
  }

  const base = await supabase
    .from("profiles")
    .select(PROFILE_SELECT_FIELDS)
    .eq("id", user.id)
    .maybeSingle();

  if (base.error) throw base.error;
  return base.data ? normalizeProfile(base.data, user) : null;
}
