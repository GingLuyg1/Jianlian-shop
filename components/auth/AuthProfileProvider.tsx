"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";

import { ACCOUNT_BALANCE_UPDATED_EVENT } from "@/lib/account/balance-events";
import {
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
  safeSessionStorageGet,
  safeSessionStorageRemove,
  safeSessionStorageSet,
} from "@/lib/browser/safe-storage";
import {
  getCurrentProfile,
  getSupabaseBrowserClient,
  hasSupabaseConfig,
  invalidateCurrentProfileCache,
  type UserProfile,
} from "@/lib/supabase/client";

const AUTH_CACHE_STORAGE_KEY = "jianlian_topbar_auth_cache_v1";

type PublicAuthProfileContextValue = {
  user: User | null;
  profile: UserProfile | null;
  authReady: boolean;
  balance: number;
  refreshProfile: (force?: boolean) => Promise<UserProfile | null>;
  signOut: () => Promise<void>;
};

const defaultContextValue: PublicAuthProfileContextValue = {
  user: null,
  profile: null,
  authReady: false,
  balance: 0,
  refreshProfile: async () => null,
  signOut: async () => undefined,
};

const PublicAuthProfileContext = createContext<PublicAuthProfileContextValue>(defaultContextValue);

function loadPersistedAuthCache(): { user: User | null; profile: UserProfile | null } | null {
  try {
    const raw =
      safeLocalStorageGet(AUTH_CACHE_STORAGE_KEY) ||
      safeSessionStorageGet(AUTH_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { user?: User | null; profile?: UserProfile | null };
    if (!parsed || typeof parsed !== "object") return null;
    return { user: parsed.user ?? null, profile: parsed.profile ?? null };
  } catch {
    return null;
  }
}

function persistAuthCache(user: User | null, profile: UserProfile | null) {
  if (!user) {
    safeSessionStorageRemove(AUTH_CACHE_STORAGE_KEY);
    safeLocalStorageRemove(AUTH_CACHE_STORAGE_KEY);
    return;
  }
  try {
    const serialized = JSON.stringify({ user, profile });
    safeSessionStorageSet(AUTH_CACHE_STORAGE_KEY, serialized);
    safeLocalStorageSet(AUTH_CACHE_STORAGE_KEY, serialized);
  } catch {
    // Ignore serialization/storage failures.
  }
}

export function AuthProfileProvider({ children }: { children: ReactNode }) {
  // Always initialize identically on SSR and first client render to prevent Hydration Mismatch.
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const userRef = useRef<User | null>(null);
  const profileRef = useRef<UserProfile | null>(null);
  userRef.current = user;
  profileRef.current = profile;

  const commitAuth = useCallback(
    (nextUser: User | null, nextProfile: UserProfile | null, nextReady = true) => {
      userRef.current = nextUser;
      profileRef.current = nextProfile;
      persistAuthCache(nextUser, nextProfile);
      setUser(nextUser);
      setProfile(nextProfile);
      setAuthReady(nextReady);
    },
    []
  );

  const refreshProfile = useCallback(
    async (force = false) => {
      if (!hasSupabaseConfig()) return null;
      try {
        const nextProfile = await getCurrentProfile(force);
        if (userRef.current) {
          commitAuth(userRef.current, nextProfile, true);
        }
        return nextProfile;
      } catch {
        return profileRef.current;
      }
    },
    [commitAuth]
  );

  useEffect(() => {
    const persisted = loadPersistedAuthCache();
    if (persisted?.user) {
      setUser(persisted.user);
      setProfile(persisted.profile);
      setAuthReady(true);
    }

    if (!hasSupabaseConfig()) {
      commitAuth(null, null, true);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let mounted = true;
    let initialResolved = false;

    const syncFromSession = async (sessionUser: User | null, forceProfile = false) => {
      if (!mounted) return;
      if (!sessionUser) {
        invalidateCurrentProfileCache();
        commitAuth(null, null, true);
        return;
      }
      const sameUser = userRef.current?.id === sessionUser.id;
      const fallbackProfile = sameUser ? profileRef.current : null;
      if (!sameUser || !authReady) {
        setUser(sessionUser);
        if (!sameUser) setProfile(null);
      }
      try {
        const nextProfile = await getCurrentProfile(forceProfile, sessionUser);
        if (!mounted) return;
        commitAuth(sessionUser, nextProfile, true);
      } catch {
        if (!mounted) return;
        commitAuth(sessionUser, fallbackProfile, true);
      }
    };

    // Rely on a single onAuthStateChange subscription (which emits INITIAL_SESSION)
    // plus a safe fallback timeout in case INITIAL_SESSION is delayed.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      initialResolved = true;
      const forceProfile = event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED";
      void syncFromSession(session?.user ?? null, forceProfile);
    });

    const fallbackTimer = window.setTimeout(() => {
      if (!mounted || initialResolved) return;
      void supabase.auth
        .getSession()
        .then(({ data }) => {
          if (!mounted || initialResolved) return;
          initialResolved = true;
          void syncFromSession(data.session?.user ?? null, false);
        })
        .catch(() => {
          if (mounted) commitAuth(null, null, true);
        });
    }, 1500);

    return () => {
      mounted = false;
      window.clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, [commitAuth]);

  useEffect(() => {
    let active = true;
    const onBalanceUpdated = () => {
      const currentUser = userRef.current;
      if (!currentUser || !hasSupabaseConfig()) return;
      void getCurrentProfile(true, currentUser)
        .then((nextProfile) => {
          if (active && userRef.current?.id === currentUser.id) {
            commitAuth(currentUser, nextProfile, true);
          }
        })
        .catch(() => {
          // Best-effort refresh.
        });
    };
    window.addEventListener(ACCOUNT_BALANCE_UPDATED_EVENT, onBalanceUpdated);
    return () => {
      active = false;
      window.removeEventListener(ACCOUNT_BALANCE_UPDATED_EVENT, onBalanceUpdated);
    };
  }, [commitAuth]);

  const signOut = useCallback(async () => {
    invalidateCurrentProfileCache();
    if (hasSupabaseConfig()) {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut().catch(() => undefined);
    }
    commitAuth(null, null, true);
  }, [commitAuth]);

  const value = useMemo<PublicAuthProfileContextValue>(
    () => ({
      user,
      profile,
      authReady,
      balance: profile?.balance ?? 0,
      refreshProfile,
      signOut,
    }),
    [user, profile, authReady, refreshProfile, signOut]
  );

  return (
    <PublicAuthProfileContext.Provider value={value}>
      {children}
    </PublicAuthProfileContext.Provider>
  );
}

export function usePublicAuthProfile() {
  return useContext(PublicAuthProfileContext);
}
