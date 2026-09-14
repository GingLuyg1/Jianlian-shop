import type { DajuProductDetail } from "./types";
import type { DajuBinding } from "./mapper.mjs";

export type DajuSkuStockOption = { sku: string; title: string; stock: number; price: string | null; raw: Record<string, unknown> };
export function parseDajuSkuStockBinding(productMetadata: unknown, skuMetadata: unknown): DajuBinding | null;
export function resolveDajuSkuStockBinding(productMetadata: unknown, skuMetadata: unknown, allowLegacyProductFallback?: boolean): DajuBinding | null;
export function collectDajuBoundProductIds(productRows: unknown, skuRows: unknown): string[];
export function listDajuSkuStockOptions(detail: DajuProductDetail): DajuSkuStockOption[];
export function resolveDajuEffectiveStock(detail: DajuProductDetail, supplierSku?: string | null):
  | { ok: true; stock: number; source: "product" | "sku"; option?: DajuSkuStockOption }
  | { ok: false; code: "INVALID_SUPPLIER_STOCK" | "SUPPLIER_SKU_REQUIRED" | "SUPPLIER_SKU_NOT_FOUND" };
export function buildSupplierStockSnapshotUpdate(currentStock: number, metadata: Record<string, unknown> | null, resolution: { ok: true; stock: number } | { ok: false; code: string }, syncedAt: string): { stock: number; metadata: Record<string, unknown> };
export function sumActiveSupplierSkuStock(rows: Array<{ status?: unknown; stock?: unknown }>): number;
export function buildSupplierStockAggregateUpdate(metadata: Record<string, unknown> | null, stock: number, syncedAt: string, complete: boolean): { stock: number; metadata: Record<string, unknown> };
