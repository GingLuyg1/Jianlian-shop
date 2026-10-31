"use client";

import type { PublicProductRow } from "@/lib/supabase/public-catalog";

// Public listing projection for a fast visual shell only. Never purchase authority.
const TTL = 15_000;
const entries = new Map<string, { product: PublicProductRow; savedAt: number }>();
export function rememberPublicProductPreview(row: PublicProductRow, now = Date.now()) {
  const product: PublicProductRow = {
    id: row.id, slug: row.slug, category_id: row.category_id, name: row.name,
    short_description: row.short_description, description: null,
    image_url: row.image_url, price: row.price, original_price: row.original_price,
    stock: row.stock, has_skus: row.has_skus, delivery_type: row.delivery_type,
    status: row.status, sort_order: row.sort_order, metadata: null,
    created_at: row.created_at, updated_at: row.updated_at,
  };
  for (const key of [row.id, row.slug].filter(Boolean)) {
    entries.delete(key); entries.set(key, { product, savedAt: now });
  }
  while (entries.size > 80) entries.delete(entries.keys().next().value!);
}
export function peekPublicProductPreview(id: string, now = Date.now()): PublicProductRow | null {
  const entry = entries.get(id);
  if (!entry || now - entry.savedAt >= TTL) { entries.delete(id); return null; }
  return entry.product;
}
export function clearPublicProductPreviews() { entries.clear(); }
