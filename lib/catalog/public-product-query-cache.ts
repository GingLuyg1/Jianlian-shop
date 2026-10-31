"use client";

import { getChildCategories, searchPublicCatalogProducts, type CatalogProductQuery, type CatalogProductResult, type PublicCategory } from "@/lib/supabase/public-catalog";
import { findVisibleStorefrontPrimaryCategory } from "@/lib/catalog/visible-storefront-category-routes";
import { rememberPublicProductCount } from "@/lib/catalog/public-product-count-cache";
import { rememberPublicProductPreview, clearPublicProductPreviews } from "@/lib/catalog/public-product-preview";

// Public listing data only. Neither prices nor stock in this cache authorize a purchase.
const MAX_AGE_MS = 15_000;
const MAX_ENTRIES = 24;
const entries = new Map<string, { result?: CatalogProductResult; promise?: Promise<CatalogProductResult>; savedAt: number }>();
let generation = 0;
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
    query.primaryCategoryId ?? "", query.secondaryCategoryId ?? "",
    query.keyword?.trim() ?? "", query.page ?? 1, query.pageSize ?? 20, query.excludeId ?? "",
  ]);
}

export function peekPublicProductPage(query: CatalogProductQuery, now = Date.now()) {
  const entry = entries.get(publicProductQueryKey(query));
  return entry?.result && now - entry.savedAt < MAX_AGE_MS ? entry.result : undefined;
}

export function getPublicProductPage(query: CatalogProductQuery, force = false): Promise<CatalogProductResult> {
  const key = publicProductQueryKey(query);
  const prior = entries.get(key);
  if (!force && prior?.result && Date.now() - prior.savedAt < MAX_AGE_MS) return Promise.resolve(prior.result);
  if (prior?.promise) return prior.promise;
  const promise = searchPublicCatalogProducts(query).then((result) => {
    if (entries.get(key)?.promise === promise) {
      result.products.forEach((product) => rememberPublicProductPreview(product));
      entries.delete(key);
      entries.set(key, { result, savedAt: Date.now() });
      while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
    }
    return result;
  }).catch((error: unknown) => {
    if (entries.get(key)?.promise === promise) entries.delete(key);
    throw error;
  });
  entries.set(key, { promise, savedAt: 0 });
  return promise;
}

export function clearPublicProductPages() {
  generation += 1;
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
  if (peekPublicProductPage(query)) return true;
  if (entries.get(publicProductQueryKey(query))?.promise) return false;
  backgroundInFlight += 1;
  try { await getPublicProductPage(query); return true; }
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
  const query = { primaryCategoryId: primary.id, secondaryCategoryId: first?.id ?? "", keyword: "", page: 1, pageSize: 20 };
  const startedAtGeneration = generation;
  if (background) backgroundInFlight += 1;
  return getPublicProductPage(query).then((result) => {
    if (generation !== startedAtGeneration) return false;
    // Count hints use the exact same filters and route identity as the page.
    rememberPublicProductCount(JSON.stringify([productCategory, selected.id, "", 1, 20]), href, selected.id, result.products.length);
    return true;
  }).catch(() => false).finally(() => { if (background) backgroundInFlight -= 1; });
}
