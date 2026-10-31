"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { accountRecordPreload, scheduleRechargeRecordsPrefetch } from "./record-preload";

let listening = false;

export function ensureAccountRecordPreload() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  // One tab-lifetime listener, not one per page shell. A sign-out on a page
  // without PublicLayout must also erase any records prefetched elsewhere.
  getSupabaseBrowserClient().auth.onAuthStateChange((event, session) => {
    const changed = accountRecordPreload.setUser(session?.user?.id ?? null, event === "USER_UPDATED");
    if (changed || event === "INITIAL_SESSION") scheduleRechargeRecordsPrefetch();
  });
}
