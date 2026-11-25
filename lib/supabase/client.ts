import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  getOrCreateProfile,
  userToProfile,
  type UserProfile,
  type UserRole,
} from "./profiles";

export { getOrCreateProfile, userToProfile };
export type { UserProfile, UserRole };

type SupabaseConfigStatus = {
  ok: boolean;
  url?: string;
  anonKey?: string;
  message?: string;
};

let browserClient: SupabaseClient | null = null;
let inFlightProfilePromise: Promise<UserProfile | null> | null = null;
let cachedProfileEntry: { userId: string; profile: UserProfile | null; fetchedAt: number } | null = null;
const PROFILE_CACHE_TTL_MS = 8_000;

export function invalidateCurrentProfileCache() {
  cachedProfileEntry = null;
  inFlightProfilePromise = null;
}

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

export async function getCurrentProfile(force = false, knownUser?: User | null) {
  const now = Date.now();
  if (
    !force &&
    cachedProfileEntry &&
    now - cachedProfileEntry.fetchedAt < PROFILE_CACHE_TTL_MS &&
    (!knownUser || cachedProfileEntry.userId === knownUser.id)
  ) {
    return cachedProfileEntry.profile;
  }

  if (!force && inFlightProfilePromise) {
    return inFlightProfilePromise;
  }

  const promise = (async () => {
    const supabase = getSupabaseBrowserClient();
    let user = knownUser ?? null;
    if (!user) {
      const {
        data: { user: fetchedUser },
        error,
      } = await supabase.auth.getUser();
      if (error || !fetchedUser) {
        cachedProfileEntry = null;
        return null;
      }
      user = fetchedUser;
    }

    const profile = await getOrCreateProfile(supabase, user);
    cachedProfileEntry = {
      userId: user.id,
      profile,
      fetchedAt: Date.now(),
    };
    return profile;
  })();

  inFlightProfilePromise = promise;
  try {
    return await promise;
  } finally {
    if (inFlightProfilePromise === promise) {
      inFlightProfilePromise = null;
    }
  }
}
