import { isPlainRecord, parseDajuDecimal } from "./protocol.mjs";
import { parseDajuProductBinding } from "./mapper.mjs";

export function parseDajuSkuStockBinding(productMetadata, skuMetadata) {
  if (!isPlainRecord(skuMetadata)) return null;
  const isolatedSkuMetadata = { ...skuMetadata };
  if (!Object.prototype.hasOwnProperty.call(isolatedSkuMetadata, "supplier_sku")) {
    isolatedSkuMetadata.supplier_sku = null;
  }
  return parseDajuProductBinding(isPlainRecord(productMetadata) ? productMetadata : {}, isolatedSkuMetadata);
}

export function collectDajuBoundProductIds(productRows, skuRows) {
  const ids = [];
  for (const row of [...(Array.isArray(productRows) ? productRows : []), ...(Array.isArray(skuRows) ? skuRows : [])]) {
    if (!isPlainRecord(row)) continue;
    const value = typeof row.id === "string" ? row.id : row.product_id;
    if (typeof value === "string" && value.trim() && !ids.includes(value.trim())) ids.push(value.trim());
  }
  return ids;
}

function readVariantSku(row) {
  for (const key of ["sku", "sku_id", "id", "code"]) {
    const value = row[key];
    if ((typeof value === "string" || typeof value === "number") && String(value).trim()) return String(value).trim();
  }
  return null;
}

function readVariantStock(row) {
  const value = Number(row.stock);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function readVariantTitle(row, sku) {
  for (const key of ["title", "name", "label", "spec_name", "spec_value"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return `Supplier SKU ${sku}`;
}

export function listDajuSkuStockOptions(detail) {
  if (!isPlainRecord(detail) || !Array.isArray(detail.skuVariants)) return [];
  return detail.skuVariants.flatMap((value) => {
    if (!isPlainRecord(value)) return [];
    const sku = readVariantSku(value);
    const stock = readVariantStock(value);
    if (!sku || stock === null) return [];
    return [{
      sku,
      title: readVariantTitle(value, sku),
      stock,
      price: parseDajuDecimal(value.price),
      raw: value,
    }];
  });
}

export function resolveDajuEffectiveStock(detail, supplierSku) {
  if (!isPlainRecord(detail) || !Number.isSafeInteger(detail.stock) || detail.stock < 0) {
    return { ok: false, code: "INVALID_SUPPLIER_STOCK" };
  }
  if (detail.isSku !== true) return { ok: true, stock: detail.stock, source: "product" };
  const normalizedSku = typeof supplierSku === "string" ? supplierSku.trim() : "";
  if (!normalizedSku) return { ok: false, code: "SUPPLIER_SKU_REQUIRED" };
  const option = listDajuSkuStockOptions(detail).find((item) => item.sku === normalizedSku);
  if (!option) return { ok: false, code: "SUPPLIER_SKU_NOT_FOUND" };
  return { ok: true, stock: option.stock, source: "sku", option };
}

export function buildSupplierStockSnapshotUpdate(currentStock, metadata, resolution, syncedAt) {
  const base = isPlainRecord(metadata) ? metadata : {};
  if (resolution?.ok === true && Number.isSafeInteger(resolution.stock) && resolution.stock >= 0) {
    return {
      stock: resolution.stock,
      metadata: { ...base, supplier_stock_snapshot: resolution.stock, supplier_stock_synced_at: syncedAt, supplier_stock_last_success_at: syncedAt, supplier_stock_sync_status: "synced", supplier_stock_sync_error: null },
    };
  }
  return {
    stock: currentStock,
    metadata: { ...base, supplier_stock_sync_status: resolution?.code === "SUPPLIER_SKU_REQUIRED" ? "needs_sku" : "error", supplier_stock_sync_error: resolution?.code ?? "SUPPLIER_READ_FAILED" },
  };
}

export function sumActiveSupplierSkuStock(rows) {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((total, row) => {
    if (!isPlainRecord(row) || row.status !== "active") return total;
    const stock = Number(row.stock);
    return Number.isSafeInteger(stock) && stock >= 0 ? total + stock : total;
  }, 0);
}

export function buildSupplierStockAggregateUpdate(metadata, stock, syncedAt, complete) {
  const base = isPlainRecord(metadata) ? metadata : {};
  if (complete) return buildSupplierStockSnapshotUpdate(stock, base, { ok: true, stock }, syncedAt);
  return {
    stock,
    metadata: {
      ...base,
      supplier_stock_snapshot: stock,
      supplier_stock_synced_at: syncedAt,
      supplier_stock_sync_status: "partial",
      supplier_stock_sync_error: "PARTIAL_OR_FAILED",
    },
  };
}
