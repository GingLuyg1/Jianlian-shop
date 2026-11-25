"use client";

import { getChildCategories, searchPublicCatalogProducts, type CatalogProductQuery, type CatalogProductResult, type PublicCategory } from "@/lib/supabase/public-catalog";
import { findVisibleStorefrontPrimaryCategory } from "@/lib/catalog/visible-storefront-category-routes";
import { rememberPublicProductCount } from "@/lib/catalog/public-product-count-cache";
import { rememberPublicProductPreview, clearPublicProductPreviews } from "@/lib/catalog/public-product-preview";

// Public listing data only. Neither prices nor stock in this cache authorize a purchase.
// Paint cached rows for up to 30 minutes and revalidate on access after 15 seconds.
const PRODUCT_FRESH_TTL_MS = 15_000;
const STALE_MAX_AGE_MS = 1_800_000;
const MAX_ENTRIES = 120;
type PageEntry = { result?: CatalogProductResult; promise?: Promise<CatalogProductResult>; savedAt: number };
const entries = new Map<string, PageEntry>();
let backgroundInFlight = 0;
const categoryToRoute = new Map([
  ["/products/sim-cards", "sim-cards"],
  ["/products/gift-cards", "gift-cards"],
  ["/products/digital-accounts", "digital-accounts"],
  ["/products/ai-membership", "ai-membership"],
  ["/products/sms-code", "sms-code"],
]);

export function publicProductQueryKey(query: CatalogProductQuery) {
  return JSON.stringify([
    query.primaryCategoryId ?? "", query.secondaryCategoryId ?? "", query.subcategory?.trim() ?? "",
    query.sort ?? "recommended", Boolean(query.inStockOnly),
    query.keyword?.trim() ?? "", query.page ?? 1, query.pageSize ?? 20, query.excludeId ?? "",
  ]);
}

function cacheState(entry: PageEntry | undefined, now = Date.now()) {
  if (!entry?.result) return "missing";
  const age = now - entry.savedAt;
  if (age < PRODUCT_FRESH_TTL_MS) return "fresh";
  return age < STALE_MAX_AGE_MS ? "stale" : "expired";
}

export function peekPublicProductPage(query: CatalogProductQuery, now = Date.now()) {
  const entry = entries.get(publicProductQueryKey(query));
  const state = cacheState(entry, now);
  return state === "fresh" || state === "stale" ? entry?.result : undefined;
}

function refreshPublicProductPage(query: CatalogProductQuery, key: string, entry: PageEntry = { savedAt: 0 }) {
  if (entry.promise) return entry.promise;
  const promise = searchPublicCatalogProducts(query).then((result) => {
    if (entries.get(key) === entry) {
      result.products.forEach((product) => rememberPublicProductPreview(product));
      entry.result = result;
      entry.savedAt = Date.now();
      entry.promise = undefined;
      entries.delete(key);
      entries.set(key, entry);
      while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
    }
    return result;
  }).catch((error: unknown) => {
    if (entries.get(key) === entry) {
      entry.promise = undefined;
      const state = cacheState(entry);
      if (state === "expired" || state === "missing") entries.delete(key);
    }
    throw error;
  });
  entry.promise = promise;
  entries.set(key, entry);
  return promise;
}

export function getPublicProductPage(query: CatalogProductQuery, force = false): Promise<CatalogProductResult> {
  const key = publicProductQueryKey(query);
  const entry = entries.get(key);
  const state = cacheState(entry);
  if (!force && state === "fresh" && entry?.result) return Promise.resolve(entry.result);

  const request = refreshPublicProductPage(query, key, entry);
  if (force || state !== "stale" || !entry) return request;

  return request.catch((error: unknown) => {
    if (entries.get(key) === entry && cacheState(entry) === "stale" && entry.result) return entry.result;
    throw error;
  });
}

export function clearPublicProductPages() {
  entries.clear();
  clearPublicProductPreviews();
}

export function forgetPublicProductPage(query: CatalogProductQuery) {
  entries.delete(publicProductQueryKey(query));
}

function mayBackgroundPrefetch() {
  if (typeof document === "undefined" || document.visibilityState !== "visible") return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !connection?.saveData && !["slow-2g", "2g"].includes(connection?.effectiveType ?? "");
}

/** Secondary intent shares the existing public page cache and global budget. */
export async function prefetchPublicProductPage(query: CatalogProductQuery) {
  if (!mayBackgroundPrefetch() || backgroundInFlight >= 2) return false;
  const key = publicProductQueryKey(query);
  const entry = entries.get(key);
  if (cacheState(entry) === "fresh") return true;
  if (entry?.promise) return false;
  backgroundInFlight += 1;
  try { await refreshPublicProductPage(query, key, entry); return true; }
  catch { return false; }
  finally { backgroundInFlight -= 1; }
}

export function prefetchDefaultPublicProductPage(href: string, rows: PublicCategory[], background = false) {
  const productCategory = categoryToRoute.get(href);
  if (!productCategory || (background && (!mayBackgroundPrefetch() || backgroundInFlight >= 2))) return Promise.resolve(false);
  const primary = findVisibleStorefrontPrimaryCategory(href, rows);
  if (!primary) return Promise.resolve(false);
  const first = getChildCategories(rows, primary.id)[0];
  const selected = first ?? primary;
  const query = { primaryCategoryId: primary.id, secondaryCategoryId: first?.id ?? "", keyword: "", page: 1, pageSize: 200 };
  const key = publicProductQueryKey(query);
  const entry = entries.get(key);
  if (background) backgroundInFlight += 1;
  const request = cacheState(entry) === "fresh" && entry?.result
    ? Promise.resolve(entry.result)
    : refreshPublicProductPage(query, key, entry);
  const requestedEntry = entries.get(key);
  return request.then((result) => {
    if (entries.get(key) !== requestedEntry) return false;
    // Count hints use the exact same filters and route identity as the page.
    rememberPublicProductCount(JSON.stringify([productCategory, selected.id, "", 1, 200]), href, selected.id, result.products.length);
    return true;
  }).catch(() => false).finally(() => { if (background) backgroundInFlight -= 1; });
}
