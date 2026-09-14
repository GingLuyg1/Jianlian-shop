import type { DajuProductDetail } from "./types";

export type DajuSkuStockOption = { sku: string; title: string; stock: number; price: string | null; raw: Record<string, unknown> };
export function listDajuSkuStockOptions(detail: DajuProductDetail): DajuSkuStockOption[];
export function resolveDajuEffectiveStock(detail: DajuProductDetail, supplierSku?: string | null):
  | { ok: true; stock: number; source: "product" | "sku"; option?: DajuSkuStockOption }
  | { ok: false; code: "INVALID_SUPPLIER_STOCK" | "SUPPLIER_SKU_REQUIRED" | "SUPPLIER_SKU_NOT_FOUND" };
export function buildSupplierStockSnapshotUpdate(currentStock: number, metadata: Record<string, unknown> | null, resolution: { ok: true; stock: number } | { ok: false; code: string }, syncedAt: string): { stock: number; metadata: Record<string, unknown> };
