import "server-only";

import { revalidateTag } from "next/cache";

export const CACHE_REVALIDATE_SECONDS = {
  publicLowFrequency: 300,
  publicCatalog: 30,
  publicProductDetail: 30,
} as const;

export const CACHE_TAGS = {
  products: "products",
  categories: "categories",
  siteSettings: "site-settings",
  legalDocuments: "legal-documents",
  announcements: "announcements",
  product: (id: string) => scopedTag("product", id),
  productSlug: (slug: string) => scopedTag("product-slug", slug),
  category: (id: string) => scopedTag("category", id),
  productSkus: (productId: string) => scopedTag("product-skus", productId),
} as const;

function scopedTag(prefix: string, value: string) {
  return `${prefix}:${String(value).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "unknown"}`;
}

function safeRevalidateTag(tag: string) {
  try {
    revalidateTag(tag);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[Cache] revalidateTag failed", { tag, error: error instanceof Error ? error.message : "unknown" });
    }
  }
}

export function revalidateProductCache(input: {
  id?: string | null;
  slug?: string | null;
  categoryId?: string | null;
  previousSlug?: string | null;
  previousCategoryId?: string | null;
}) {
  safeRevalidateTag(CACHE_TAGS.products);
  if (input.id) {
    safeRevalidateTag(CACHE_TAGS.product(input.id));
    safeRevalidateTag(CACHE_TAGS.productSkus(input.id));
  }
  if (input.slug) safeRevalidateTag(CACHE_TAGS.productSlug(input.slug));
  if (input.previousSlug && input.previousSlug !== input.slug) {
    safeRevalidateTag(CACHE_TAGS.productSlug(input.previousSlug));
  }
  if (input.categoryId) safeRevalidateTag(CACHE_TAGS.category(input.categoryId));
  if (input.previousCategoryId && input.previousCategoryId !== input.categoryId) {
    safeRevalidateTag(CACHE_TAGS.category(input.previousCategoryId));
  }
}

export function revalidateCategoryCache(input: { id?: string | null; parentId?: string | null }) {
  safeRevalidateTag(CACHE_TAGS.categories);
  safeRevalidateTag(CACHE_TAGS.products);
  if (input.id) safeRevalidateTag(CACHE_TAGS.category(input.id));
  if (input.parentId) safeRevalidateTag(CACHE_TAGS.category(input.parentId));
}

export function revalidateSiteSettingsCache() {
  safeRevalidateTag(CACHE_TAGS.siteSettings);
  safeRevalidateTag(CACHE_TAGS.announcements);
}

export function revalidateLegalDocumentsCache() {
  safeRevalidateTag(CACHE_TAGS.legalDocuments);
}
