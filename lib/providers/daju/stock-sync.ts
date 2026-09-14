import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createDajuClient } from "./client";
import { parseDajuProductBinding } from "./mapper.mjs";
import { buildSupplierStockAggregateUpdate, buildSupplierStockSnapshotUpdate, parseDajuSkuStockBinding, resolveDajuEffectiveStock, sumActiveSupplierSkuStock } from "./stock.mjs";
import type { DajuClient, DajuProductDetail } from "./types";

type SyncOptions = { service: SupabaseClient; productId: string; client?: DajuClient };
type Row = { id: string; stock: number; metadata: Record<string, unknown> | null; delivery_type?: string | null; status?: string | null };

const now = () => new Date().toISOString();
const metadataOf = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export async function syncDajuProductStock({ service, productId, client = createDajuClient() }: SyncOptions) {
  const { data: product, error: productError } = await service.from("products").select("id,stock,metadata,delivery_type").eq("id", productId).maybeSingle();
  if (productError || !product) return { ok: false as const, code: "PRODUCT_NOT_FOUND", updated: 0 };
  const productRow = product as Row;
  const { data: skuRows, error: skuError } = await service.from("product_skus").select("id,stock,status,metadata,delivery_type").eq("product_id", productId).order("sort_order");
  if (skuError) return { ok: false as const, code: "SKU_READ_FAILED", updated: 0 };
  const rows = (skuRows ?? []) as Row[];
  const details = new Map<number, DajuProductDetail>();
  const loadDetail = async (supplierProductId: number) => {
    if (!details.has(supplierProductId)) details.set(supplierProductId, await client.getProduct(supplierProductId));
    return details.get(supplierProductId)!;
  };
  const syncedAt = now();

  if (rows.length > 0) {
    let updated = 0;
    let aggregateComplete = true;
    const effectiveRows: Array<{ status: string | null | undefined; stock: number }> = [];
    for (const row of rows) {
      const metadata = metadataOf(row.metadata);
      const binding = parseDajuSkuStockBinding(metadataOf(productRow.metadata), metadata);
      if (!binding) {
        aggregateComplete = false;
        effectiveRows.push({ status: row.status, stock: row.stock });
        continue;
      }
      try {
        const detail = await loadDetail(binding.productId);
        const resolved = resolveDajuEffectiveStock(detail, binding.sku);
        if (!resolved.ok) {
          aggregateComplete = false;
          await service.from("product_skus").update({ metadata: buildSupplierStockSnapshotUpdate(row.stock, metadata, resolved, syncedAt).metadata }).eq("id", row.id);
          effectiveRows.push({ status: row.status, stock: row.stock });
          continue;
        }
        const update = buildSupplierStockSnapshotUpdate(row.stock, metadata, resolved, syncedAt);
        const { error } = await service.from("product_skus").update(update).eq("id", row.id);
        if (error) {
          aggregateComplete = false;
          effectiveRows.push({ status: row.status, stock: row.stock });
          continue;
        }
        updated += 1;
        effectiveRows.push({ status: row.status, stock: resolved.stock });
      } catch {
        aggregateComplete = false;
        await service.from("product_skus").update({ metadata: buildSupplierStockSnapshotUpdate(row.stock, metadata, { ok: false, code: "SUPPLIER_READ_FAILED" }, syncedAt).metadata }).eq("id", row.id);
        effectiveRows.push({ status: row.status, stock: row.stock });
      }
    }
    const aggregate = sumActiveSupplierSkuStock(effectiveRows);
    const complete = aggregateComplete && updated === rows.length;
    const { error: aggregateError } = await service.from("products").update(buildSupplierStockAggregateUpdate(metadataOf(productRow.metadata), aggregate, syncedAt, complete)).eq("id", productId);
    if (aggregateError) return { ok: false as const, code: "STOCK_WRITE_FAILED", updated, stock: productRow.stock };
    return { ok: complete, code: complete ? "SYNCED" : "PARTIAL_OR_FAILED", updated, stock: aggregate } as const;
  }

  const productMetadata = metadataOf(productRow.metadata);
  const binding = parseDajuProductBinding(productMetadata);
  if (!binding) return { ok: false as const, code: "BINDING_NOT_FOUND", updated: 0 };
  try {
    const detail = await loadDetail(binding.productId);
    const resolved = resolveDajuEffectiveStock(detail, binding.sku);
    if (!resolved.ok) {
      await service.from("products").update({ metadata: buildSupplierStockSnapshotUpdate(productRow.stock, productMetadata, resolved, syncedAt).metadata }).eq("id", productId);
      return { ok: false as const, code: resolved.code, updated: 0, stock: productRow.stock };
    }
    const { error } = await service.from("products").update(buildSupplierStockSnapshotUpdate(productRow.stock, productMetadata, resolved, syncedAt)).eq("id", productId);
    return error ? { ok: false as const, code: "STOCK_WRITE_FAILED", updated: 0 } : { ok: true as const, code: "SYNCED", updated: 1, stock: resolved.stock };
  } catch {
    await service.from("products").update({ metadata: buildSupplierStockSnapshotUpdate(productRow.stock, productMetadata, { ok: false, code: "SUPPLIER_READ_FAILED" }, syncedAt).metadata }).eq("id", productId);
    return { ok: false as const, code: "SUPPLIER_READ_FAILED", updated: 0, stock: productRow.stock };
  }
}
