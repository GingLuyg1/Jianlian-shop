"use client";

import { useEffect, useState } from "react";

import type { DashboardDateRange } from "@/components/admin/dashboard/DashboardDateRangeFilter";
import { parseDashboardAnalytics, type DashboardAnalytics } from "@/lib/admin/dashboard-analytics-ui";

const cache = new Map<string, DashboardAnalytics>();
const pending = new Map<string, Promise<DashboardAnalytics>>();

function readAnalytics(from: string, to: string) {
  const key = `${from}/${to}`;
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(key);
  if (existing) return existing;
  const request = fetch(`/api/admin/dashboard/analytics?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
    cache: "no-store",
    credentials: "same-origin",
  }).then(async (response) => {
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || "统计读取失败，请重试。");
    const result = parseDashboardAnalytics(body, from, to);
    cache.set(key, result);
    return result;
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

export function clearDashboardAnalyticsCache() {
  cache.clear();
}

export function useDashboardAnalytics(range: DashboardDateRange, refresh: number) {
  const key = `${range.from}/${range.to}/${refresh}`;
  const [state, setState] = useState<{ key: string; data: DashboardAnalytics | null; loading: boolean; error: string }>({
    key, data: null, loading: true, error: "",
  });
  useEffect(() => {
    let current = true;
    setState({ key, data: null, loading: true, error: "" });
    void readAnalytics(range.from, range.to).then(
      (data) => { if (current) setState({ key, data, loading: false, error: "" }); },
      (error) => { if (current) setState({ key, data: null, loading: false, error: error instanceof Error ? error.message : "统计读取失败，请重试。" }); },
    );
    return () => { current = false; };
  }, [range.from, range.to, refresh, key]);
  return state.key === key ? state : { data: null, loading: true, error: "" };
}
