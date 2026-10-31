// A short-lived, public-only hint for the number of cards on one exact result page.
// This count never authorizes purchases or supplies product data; the public
// page cache separately revalidates listings on a short TTL.
const MAX_AGE_MS = 15_000;
const counts = new Map<string, { categoryId: string; count: number; savedAt: number }>();
const routeQueries = new Map<string, string>();
const categoryTotals = new Map<string, { total: number; savedAt: number }>();
const TOTAL_MAX_AGE_MS = 30_000;
let fetchedAt = 0;
let nextAttemptAt = 0;
let generation = 0;
let pending: Promise<boolean> | null = null;
let version = 0;
const listeners = new Set<() => void>();
function publish() { version += 1; listeners.forEach((listener) => listener()); }
export function subscribePublicProductCounts(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function getPublicProductCountVersion() { return version; }
export function getServerPublicProductCountVersion() { return 0; }

/** One optional bulk read for all public secondary categories, never a count per card. */
export function prefetchPublicProductCounts(): Promise<boolean> {
  if (pending) return pending;
  if (fetchedAt > 0 && Date.now() - fetchedAt < TOTAL_MAX_AGE_MS) return Promise.resolve(true);
  const connection = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (typeof document === "undefined" || document.visibilityState !== "visible" || connection?.saveData ||
    ["2g", "slow-2g"].includes(connection?.effectiveType ?? "") || Date.now() < nextAttemptAt) return Promise.resolve(false);
  const startedGeneration = generation;
  nextAttemptAt = Date.now() + 5000;
  const request = fetch("/api/catalog/product-counts", { cache: "no-store" }).then(async (response) => {
    if (!response.ok) return false;
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("complete" in result) || result.complete !== true ||
      !("counts" in result) || !Array.isArray(result.counts) || result.counts.length > 1000 || generation !== startedGeneration) return false;
    const valid = result.counts.every((row: unknown) => row && typeof row === "object" &&
      "secondaryCategoryId" in row && typeof row.secondaryCategoryId === "string" &&
      "primaryCategoryId" in row && typeof row.primaryCategoryId === "string" &&
      "total" in row && typeof row.total === "number" && Number.isInteger(row.total) && row.total >= 0 && row.total <= 1000);
    if (!valid) return false;
    const savedAt = Date.now();
    categoryTotals.clear();
    for (const row of result.counts) categoryTotals.set(row.secondaryCategoryId, { total: row.total, savedAt });
    fetchedAt = savedAt;
    publish();
    return true;
  }).catch(() => false).finally(() => { if (pending === request) pending = null; });
  pending = request;
  return request;
}

function prefetchedPageCount(queryKey: string, now: number) {
  try {
    const [route, categoryId, search, page, pageSize] = JSON.parse(queryKey);
    if (typeof route !== "string" || typeof categoryId !== "string" || search !== "" ||
      !Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 60) return undefined;
    const row = categoryTotals.get(categoryId);
    if (!row || now - row.savedAt >= TOTAL_MAX_AGE_MS) return undefined;
    // Listing clamps out-of-range pages to its last page; mirror that contract.
    const safePage = Math.min(page, Math.max(1, Math.ceil(row.total / pageSize)));
    return Math.min(pageSize, Math.max(0, row.total - (safePage - 1) * pageSize));
  } catch { return undefined; }
}

export function rememberPublicProductCount(queryKey: string, route: string, categoryId: string, count: number, now = Date.now()) {
  counts.set(queryKey, { categoryId, count: Math.max(0, Math.floor(count)), savedAt: now });
  routeQueries.set(route, queryKey);
  if (counts.size > 100) counts.delete(counts.keys().next().value!);
  if (routeQueries.size > 100) routeQueries.delete(routeQueries.keys().next().value!);
}

export function getPublicProductCount(queryKey: string, now = Date.now()): number | undefined {
  const entry = counts.get(queryKey);
  if (!entry) return prefetchedPageCount(queryKey, now);
  if (now - entry.savedAt > MAX_AGE_MS) {
    counts.delete(queryKey);
    return prefetchedPageCount(queryKey, now);
  }
  return entry.count;
}

export function getPublicProductCountForRoute(route: string, now = Date.now()): number | undefined {
  const queryKey = routeQueries.get(route);
  return queryKey ? getPublicProductCount(queryKey, now) : undefined;
}

export function forgetPublicProductCount(queryKey: string) {
  counts.delete(queryKey);
  try { categoryTotals.delete(JSON.parse(queryKey)[1]); } catch { /* Legacy opaque keys have no bulk hint. */ }
}

export function retainVisiblePublicProductCounts(visibleCategoryIds: ReadonlySet<string>) {
  counts.forEach((entry, key) => {
    if (!visibleCategoryIds.has(entry.categoryId)) counts.delete(key);
  });
  categoryTotals.forEach((_, key) => { if (!visibleCategoryIds.has(key)) categoryTotals.delete(key); });
}

export function clearPublicProductCounts() {
  generation += 1;
  counts.clear();
  routeQueries.clear();
  categoryTotals.clear();
  fetchedAt = 0;
  nextAttemptAt = 0;
  pending = null;
  publish();
}
