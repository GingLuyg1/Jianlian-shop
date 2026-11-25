"use client";

import type { PublicProductRow } from "@/lib/supabase/public-catalog";

// Public listing projection for a fast visual shell only. Never purchase authority.
const TTL = 15_000;
const entries = new Map<string, { product: PublicProductRow; savedAt: number }>();
const STORAGE_PREFIX = "jianlian_product_preview_";

function safeSessionGet(key: string): { product: PublicProductRow; savedAt: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, data: { product: PublicProductRow; savedAt: number }) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data));
  } catch {
    /* Safe fallback if quota exceeded */
  }
}

export function rememberPublicProductPreview(row: PublicProductRow, now = Date.now()) {
  const product: PublicProductRow = {
    id: row.id,
    slug: row.slug,
    category_id: row.category_id,
    name: row.name,
    short_description: row.short_description,
    description: null,
    image_url: row.image_url,
    price: row.price,
    original_price: row.original_price,
    stock: row.stock,
    has_skus: row.has_skus,
    delivery_type: row.delivery_type,
    status: row.status,
    sort_order: row.sort_order,
    sales_count: row.sales_count ?? null,
    metadata: row.metadata ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  const entry = { product, savedAt: now };

  for (const key of [row.id, row.slug].filter(Boolean) as string[]) {
    entries.delete(key);
    entries.set(key, entry);
    safeSessionSet(key, entry);
  }
  while (entries.size > 80) entries.delete(entries.keys().next().value!);
}

export function peekPublicProductPreview(id: string, now = Date.now()): PublicProductRow | null {
  if (!id) return null;
  const entry = entries.get(id);
  if (entry && now - entry.savedAt < TTL) {
    return entry.product;
  }
  if (entry) entries.delete(id);
  return null;
}

export function peekPublicProductPreviewFromStorage(id: string, now = Date.now()): PublicProductRow | null {
  const inMemory = peekPublicProductPreview(id, now);
  if (inMemory) return inMemory;
  const stored = safeSessionGet(id);
  if (stored && now - stored.savedAt < TTL) {
    entries.set(id, stored);
    return stored.product;
  }
  return null;
}

export function clearPublicProductPreviews() {
  entries.clear();
  if (typeof window !== "undefined") {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i);
        if (k && k.startsWith(STORAGE_PREFIX)) keysToRemove.push(k);
      }
      keysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
    } catch {
      /* Safe ignore */
    }
  }
}
