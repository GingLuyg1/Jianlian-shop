#!/usr/bin/env node
/**
 * KuajingZY Catalog Stock & Availability Snapshot Sync Worker (GET-only).
 * Reads live KuajingZY mall catalog pages and updates product_skus.metadata
 * snapshot freshness + local sellable stock/status safely.
 *
 * Usage:
 *   node scripts/ops/sync-kuajingzy-stock-snapshots.mjs
 */
import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const env = {
  ...loadEnvFile("/www/jianlian-shop/.env.local"),
  ...loadEnvFile(path.resolve(".env.production.local")),
  ...loadEnvFile(path.resolve(".env.local")),
  ...process.env,
};

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SUPABASE_SERVICE_ROLE ||
  env.SUPABASE_SECRET_KEY ||
  env.SUPABASE_SECRET;
const KUAJINGZY_API_KEY = env.KUAJINGZY_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !KUAJINGZY_API_KEY) {
  console.error("[kuajingzy-sync] Missing required env vars");
  process.exit(1);
}

const sbHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

const kjHeaders = {
  Authorization: `Bearer ${KUAJINGZY_API_KEY}`,
  Accept: "application/json",
};

async function fetchAllKuajingZyCatalog() {
  const byId = new Map();
  let cursor = null;
  let pages = 0;
  const maxPages = 60;

  while (pages < maxPages) {
    pages++;
    const params = new URLSearchParams({ limit: "200" });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`https://888.kuajing.one/api/open/v1/catalog/mall?${params.toString()}`, {
      headers: kjHeaders,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`KuajingZY catalog HTTP ${res.status} on page ${pages}`);
    }
    const json = await res.json();
    const items = json?.data?.items || [];
    for (const item of items) {
      if (item?.id) byId.set(item.id, item);
    }
    const nextCursor = json?.data?.nextCursor ?? null;
    if (!nextCursor || nextCursor === cursor || items.length === 0) break;
    cursor = nextCursor;
    // Gentle throttle to stay well under KuajingZY rate limits
    await new Promise((r) => setTimeout(r, 350));
  }

  return { byId, pages };
}

async function fetchAllKuajingZySkus() {
  const rows = [];
  const pageSize = 500;
  let offset = 0;

  while (true) {
    const url =
      `${SUPABASE_URL}/rest/v1/product_skus` +
      `?metadata->>supplier=eq.kuajingzy` +
      `&select=id,product_id,stock,status,metadata` +
      `&order=id.asc&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, { headers: sbHeaders });
    if (!res.ok) throw new Error(`Supabase product_skus read HTTP ${res.status}`);
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

async function main() {
  const startedAt = Date.now();
  const { byId, pages } = await fetchAllKuajingZyCatalog();
  const skus = await fetchAllKuajingZySkus();
  const syncedAt = new Date().toISOString();

  let updated = 0;
  let inStockCount = 0;
  let outOfStockCount = 0;
  let missingInCatalog = 0;
  let failed = 0;

  const productStockAgg = new Map();

  // Process in bounded concurrent batches of 15
  const concurrency = 15;
  for (let i = 0; i < skus.length; i += concurrency) {
    const chunk = skus.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (sku) => {
        const meta = sku.metadata || {};
        const itemId = meta.supplier_product_id;
        const variantId = meta.supplier_sku ?? null;
        const item = itemId ? byId.get(itemId) : null;

        let effectiveStock = 0;
        let syncStatus = "synced";
        let stale = false;

        if (!item) {
          missingInCatalog++;
          effectiveStock = 0;
          syncStatus = "not_found";
          stale = true;
        } else {
          const topStock = Number.isSafeInteger(item.stock) ? item.stock : 0;
          const purchasable = item.purchasable !== false;
          let variantStock = topStock;
          if (Array.isArray(item.variants) && item.variants.length > 0) {
            const matched = item.variants.find((v) => String(v.id) === String(variantId));
            variantStock = matched && Number.isSafeInteger(matched.stock) ? matched.stock : 0;
          }
          effectiveStock = purchasable ? Math.max(0, Math.min(topStock, variantStock)) : 0;
        }

        if (effectiveStock > 0) inStockCount++;
        else outOfStockCount++;

        const nextMeta = {
          ...meta,
          supplier_auto_purchase_enabled: true,
          supplier_stock_snapshot: effectiveStock,
          supplier_stock_stale: stale,
          supplier_stock_sync_status: syncStatus,
          supplier_stock_last_success_at: syncedAt,
        };

        const nextStatus =
          sku.status === "inactive" || sku.status === "draft"
            ? sku.status
            : effectiveStock > 0
              ? "active"
              : "sold_out";

        const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/product_skus?id=eq.${sku.id}`, {
          method: "PATCH",
          headers: sbHeaders,
          body: JSON.stringify({
            stock: effectiveStock,
            status: nextStatus,
            metadata: nextMeta,
          }),
        });
        if (!patchRes.ok) {
          failed++;
        } else {
          updated++;
        }

        const prev = productStockAgg.get(sku.product_id) ?? 0;
        productStockAgg.set(sku.product_id, prev + effectiveStock);
      })
    );
  }

  // Also refresh parent products.stock to match summed SKU stocks
  const prodEntries = Array.from(productStockAgg.entries());
  let prodUpdated = 0;
  for (let i = 0; i < prodEntries.length; i += concurrency) {
    const chunk = prodEntries.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async ([productId, totalStock]) => {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${productId}`, {
          method: "PATCH",
          headers: sbHeaders,
          body: JSON.stringify({ stock: totalStock }),
        });
        if (res.ok) prodUpdated++;
      })
    );
  }

  console.log(
    JSON.stringify(
      {
        OK: true,
        CATALOG_PAGES: pages,
        CATALOG_ITEMS: byId.size,
        SKUS_TOTAL: skus.length,
        SKUS_UPDATED: updated,
        SKUS_FAILED: failed,
        IN_STOCK: inStockCount,
        OUT_OF_STOCK: outOfStockCount,
        MISSING_IN_CATALOG: missingInCatalog,
        PRODUCTS_STOCK_UPDATED: prodUpdated,
        SYNCED_AT: syncedAt,
        ELAPSED_MS: Date.now() - startedAt,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("[kuajingzy-sync] Fatal:", err?.message || err);
  process.exit(1);
});
