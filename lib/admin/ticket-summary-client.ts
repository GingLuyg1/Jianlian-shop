"use client";

export type AdminTicketSummaryCounts = {
  processing: number;
  completed: number;
  total: number;
};

const SUMMARY_CACHE_TTL_MS = 5_000;

let cachedCounts: AdminTicketSummaryCounts | null = null;
let cachedAt = 0;
let inFlightPromise: Promise<AdminTicketSummaryCounts | null> | null = null;

export function invalidateAdminTicketSummaryCache() {
  cachedCounts = null;
  cachedAt = 0;
}

export async function fetchAdminTicketSummary(options?: { force?: boolean }): Promise<AdminTicketSummaryCounts | null> {
  const now = Date.now();
  if (!options?.force && cachedCounts && now - cachedAt < SUMMARY_CACHE_TTL_MS) {
    return cachedCounts;
  }
  if (inFlightPromise) {
    return inFlightPromise;
  }
  inFlightPromise = (async () => {
    try {
      const res = await fetch("/api/admin/tickets?summary=1", { cache: "no-store" });
      if (!res.ok) return null;
      const payload = (await res.json().catch(() => null)) as {
        counts?: { processing?: number; completed?: number; total?: number };
      } | null;
      if (!payload?.counts) return null;
      const counts: AdminTicketSummaryCounts = {
        processing: Number(payload.counts.processing ?? 0),
        completed: Number(payload.counts.completed ?? 0),
        total: Number(payload.counts.total ?? 0),
      };
      cachedCounts = counts;
      cachedAt = Date.now();
      return counts;
    } catch {
      return null;
    } finally {
      inFlightPromise = null;
    }
  })();
  return inFlightPromise;
}
