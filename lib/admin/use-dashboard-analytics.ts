"use client";
import { useEffect, useState } from "react";
import type { DashboardDateRange } from "@/components/admin/dashboard/DashboardDateRangeFilter";
import { parseDashboardAnalytics, type DashboardAnalytics } from "@/lib/admin/dashboard-analytics-ui";
import { createDashboardReadCache } from "@/lib/admin/dashboard-read-cache.mjs";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const cache = createDashboardReadCache();
const readers = new Set<() => void>();
let stopAuthListener: (() => void) | null = null;
let identity: string | null | undefined;
function subscribeAuth(callback: () => void) {
  if (!readers.size) {
    cache.clear();
    identity = undefined;
    const { data } = getSupabaseBrowserClient().auth.onAuthStateChange((event, session) => {
      const nextIdentity = session?.user.id ?? null;
      const changed = identity !== undefined && identity !== nextIdentity;
      identity = nextIdentity;
      // Supabase can emit SIGNED_IN again on focus for the same user.
      if (!changed && event !== "SIGNED_OUT") return;
      cache.clear();
      readers.forEach(notify => notify());
    });
    stopAuthListener = () => data.subscription.unsubscribe();
  }
  readers.add(callback);
  return () => {
    readers.delete(callback);
    if (!readers.size) { stopAuthListener?.(); stopAuthListener = null; cache.clear(); }
  };
}
function readAnalytics(from: string, to: string) {
  return cache.read(from + "/" + to, async () => {
    const response = await fetch("/api/admin/dashboard/analytics?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to), {
      // Includes the route's normal auth and cold module loading; SQL is bounded at 8s server-side.
      cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(30_000),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || "统计读取失败，请重试。");
    return parseDashboardAnalytics(body, from, to);
  });
}
export function clearDashboardAnalyticsCache() { cache.clear(); }
export function useDashboardAnalytics(range: DashboardDateRange, refresh: number) {
  const [authVersion, setAuthVersion] = useState(0);
  const key = range.from + "/" + range.to + "/" + refresh + "/" + authVersion;
  const [state, setState] = useState<{ key: string; data: DashboardAnalytics | null; loading: boolean; error: string }>({
    key, data: null, loading: true, error: "",
  });
  useEffect(() => subscribeAuth(() => setAuthVersion(value => value + 1)), []);
  useEffect(() => {
    let current = true;
    setState({ key, data: null, loading: true, error: "" });
    void readAnalytics(range.from, range.to).then(
      (data) => { if (current) setState({ key, data, loading: false, error: "" }); },
      (error) => { if (current) setState({ key, data: null, loading: false, error: error instanceof Error && error.name !== "TimeoutError" ? error.message : "统计读取超时，请重试。" }); },
    );
    return () => { current = false; };
  }, [range.from, range.to, refresh, authVersion, key]);
  return state.key === key ? state : { data: null, loading: true, error: "" };
}
