"use client";

import { useEffect, useSyncExternalStore } from "react";

import { listPublicCategories, type PublicCategory } from "@/lib/supabase/public-catalog";
import { clearPublicProductPages } from "@/lib/catalog/public-product-query-cache";

export type PublicCategorySnapshot = {
  status: "idle" | "loading" | "ready" | "refreshing" | "error";
  rows: PublicCategory[] | null;
};

const REFRESH_AFTER_MS = 30_000;
const SNAPSHOT_STORAGE_KEY = "jianlian_public_category_snapshot_v1";

function loadPersistedSnapshot(): { rows: PublicCategory[]; savedAt: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function persistSnapshot(rows: PublicCategory[]) {
  if (typeof window === "undefined" || !rows || rows.length === 0) return;
  try {
    window.sessionStorage.setItem(
      SNAPSHOT_STORAGE_KEY,
      JSON.stringify({ rows, savedAt: Date.now() })
    );
  } catch {
    /* Safe fallback if storage quota exceeded */
  }
}

// Always keep SSR / initial client snapshot static to eliminate React Hydration Mismatch;
// persisted sessionStorage snapshot is hydrated inside useEffect after mount.
const SERVER_SNAPSHOT: PublicCategorySnapshot = Object.freeze({ status: "idle", rows: null });

let snapshot: PublicCategorySnapshot = SERVER_SNAPSHOT;
let fetchedAt = 0;
let hydratedFromStorage = false;
let pending: Promise<PublicCategory[]> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function publish(next: PublicCategorySnapshot) {
  snapshot = next;
  if (next.status === "ready" && next.rows && next.rows.length > 0) {
    persistSnapshot(next.rows);
  }
  listeners.forEach((listener) => listener());
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (!listeners.size || typeof document === "undefined") return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    if (document.visibilityState === "visible") void refreshPublicCategories().catch(() => undefined);
    else scheduleRefresh();
  }, REFRESH_AFTER_MS);
}

/** Only effectively visible, RLS-filtered public category rows are retained. */
export function refreshPublicCategories(force = false): Promise<PublicCategory[]> {
  if (pending) return pending;
  if (!force && snapshot.status === "ready" && Date.now() - fetchedAt < REFRESH_AFTER_MS) {
    return Promise.resolve(snapshot.rows ?? []);
  }

  publish({ status: snapshot.rows ? "refreshing" : "loading", rows: snapshot.rows });
  pending = listPublicCategories()
    .then((rows) => {
      const identity = (items: PublicCategory[] | null) => items?.map((row) => [row.id, row.parent_id, row.status, row.is_active, row.sort_order, row.updated_at].join(":" )).join("|");
      if (snapshot.rows && identity(snapshot.rows) !== identity(rows)) clearPublicProductPages();
      fetchedAt = Date.now();
      // A successful unchanged revalidation must not recreate derived category
      // objects and restart the current product request every 30 seconds.
      // Compare the full public rows so names/icons/visibility changes still
      // propagate; failures continue to invalidate the snapshot below.
      const stableRows = snapshot.rows && JSON.stringify(snapshot.rows) === JSON.stringify(rows)
        ? snapshot.rows
        : rows;
      publish({ status: "ready", rows: stableRows });
      return stableRows;
    })
    .catch((error: unknown) => {
      // On failed revalidation, do not keep potentially disabled categories clickable indefinitely.
      clearPublicProductPages();
      publish({ status: "error", rows: null });
      throw error;
    })
    .finally(() => {
      pending = null;
      scheduleRefresh();
    });
  return pending;
}

export function invalidatePublicCategories() {
  fetchedAt = 0;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(SNAPSHOT_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  return refreshPublicCategories(true);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") {
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    scheduleRefresh();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && typeof window !== "undefined") {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  };
}

function onFocus() {
  void refreshPublicCategories().catch(() => undefined);
}

function onVisible() {
  if (document.visibilityState === "visible") onFocus();
}

export function usePublicCategorySnapshot() {
  const current = useSyncExternalStore(subscribe, () => snapshot, () => SERVER_SNAPSHOT);
  useEffect(() => {
    if (!hydratedFromStorage) {
      hydratedFromStorage = true;
      if (snapshot.status === "idle") {
        const persisted = loadPersistedSnapshot();
        if (persisted && persisted.rows.length > 0) {
          fetchedAt = persisted.savedAt;
          publish({ status: "ready", rows: persisted.rows });
        }
      }
    }
    void refreshPublicCategories().catch(() => undefined);
  }, []);
  return current;
}
