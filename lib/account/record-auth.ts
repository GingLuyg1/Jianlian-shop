"use client";

import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { accountRecordPreload, scheduleRechargeRecordsPrefetch } from "./record-preload";

let listening = false;

export function ensureAccountRecordPreload() {
  if (listening || typeof window === "undefined" || !hasSupabaseConfig()) return;
  listening = true;
  // One tab-lifetime listener, not one per page shell. A sign-out on a page
  // without PublicLayout must also erase any records prefetched elsewhere.
  const supabase = getSupabaseBrowserClient();
  supabase.auth.onAuthStateChange((event, session) => {
    const changed = accountRecordPreload.setUser(session?.user?.id ?? null, event === "USER_UPDATED");
    if (changed || event === "INITIAL_SESSION") scheduleRechargeRecordsPrefetch();
  });
  // Fallback if INITIAL_SESSION was already emitted before listener registration or delayed.
  void supabase.auth
    .getSession()
    .then(({ data }) => {
      if (accountRecordPreload.getSnapshot().status === "checking") {
        const changed = accountRecordPreload.setUser(data.session?.user?.id ?? null, false);
        if (changed) scheduleRechargeRecordsPrefetch();
      }
    })
    .catch(() => {
      if (accountRecordPreload.getSnapshot().status === "checking") {
        accountRecordPreload.setUser(null, false);
      }
    });
}
