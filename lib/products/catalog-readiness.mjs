import { LEGACY_SKU_DEFINITIONS } from "./legacy-sku-backfill.mjs";
import { evaluateSkuActivationReadiness, getSupplierStockEvidence, summarizeSkuReadiness } from "./sku-activation-readiness.mjs";

const REQUIRED_SKU_FIELDS = [
  "id",
  "product_id",
  "sku_code",
  "sku_title",
  "combination_key",
  "price",
  "original_price",
  "stock",
  "status",
  "delivery_type",
  "image_url",
  "sort_order",
  "metadata",
  "created_at",
  "updated_at",
];

function errorSummary(error) {
  if (!error) return null;
  return {
    database_code: typeof error.code === "string" ? error.code : null,
    message: typeof error.message === "string" ? error.message : "catalog schema probe failed",
  };
}

export async function inspectCatalogSkuSchema(service) {
  const [productProbe, skuProbe] = await Promise.all([
    service.from("products").select("id,has_skus").limit(1),
    service.from("product_skus").select(REQUIRED_SKU_FIELDS.join(",")).limit(1),
  ]);
  const issues = [];
  if (productProbe.error) issues.push({ code: "PRODUCTS_HAS_SKUS_UNAVAILABLE", ...errorSummary(productProbe.error) });
  if (skuProbe.error) issues.push({ code: "PRODUCT_SKUS_SCHEMA_UNAVAILABLE", ...errorSummary(skuProbe.error) });
  return { ready: issues.length === 0, issues };
}

export function buildCatalogSkuDiagnostics(product, skus, schemaReadiness, activationReadinessBySku = {}) {
  const rows = Array.isArray(skus) ? skus : [];
  const productMetadata = product?.metadata && typeof product.metadata === "object" && !Array.isArray(product.metadata)
    ? product.metadata
    : {};
  const definitions = LEGACY_SKU_DEFINITIONS[String(product?.slug ?? "")] ?? [];
  const existingCodes = new Set(rows.map((row) => String(row?.sku_code ?? "").trim().toLowerCase()).filter(Boolean));
  const legacyMissingCodes = definitions
    .map((definition) => definition.sku_code)
    .filter((code) => !existingCodes.has(code.toLowerCase()));
  const supplierRows = rows.map((row) => {
    const metadata = row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata
      : {};
    const supplierEvidence = getSupplierStockEvidence(metadata);
    const directSupplierConfigured = supplierEvidence.supplier_requested;
    const directBound = supplierEvidence.binding_complete;
    const parentSupplierConfigured = productMetadata.fulfillment_source === "supplier"
      && productMetadata.supplier === "daju"
      && Boolean(productMetadata.supplier_product_id);
    const parentBound = parentSupplierConfigured && Boolean(productMetadata.supplier_sku);
    const supplierExpected = directSupplierConfigured || parentSupplierConfigured;
    const bound = directBound;
    const activationReadiness = activationReadinessBySku[String(row?.id ?? "")]
      ?? evaluateSkuActivationReadiness({ product, sku: row, localAvailableCount: 0 });
    return {
      sku_id: String(row?.id ?? ""),
      sku_code: row?.sku_code ? String(row.sku_code) : null,
      website_stock: Number(row?.stock ?? 0),
      supplier_expected: supplierExpected,
      supplier_bound: bound,
      supplier_product_id: directSupplierConfigured ? metadata.supplier_product_id : rows.length === 1 ? productMetadata.supplier_product_id ?? null : null,
      supplier_sku: directSupplierConfigured ? metadata.supplier_sku ?? null : rows.length === 1 ? productMetadata.supplier_sku ?? null : null,
      supplier_stock_snapshot: metadata.supplier_stock_snapshot ?? null,
      supplier_stock_sync_status: metadata.supplier_stock_sync_status ?? null,
      supplier_stock_sync_error: metadata.supplier_stock_sync_error ?? null,
      supplier_stock_last_success_at: metadata.supplier_stock_last_success_at ?? null,
      supplier_stock_sync_attempted_at: metadata.supplier_stock_sync_attempted_at ?? null,
      supplier_stock_stale: metadata.supplier_stock_stale === true,
      inventory_state: metadata.inventory_state ?? null,
      local_available_count: activationReadiness.local_available_count,
      activation_readiness: activationReadiness,
      parent_supplier_binding_ignored: !directBound && rows.length === 1 && parentBound,
    };
  });

  const summary = summarizeSkuReadiness(rows, supplierRows);

  return {
    schema_ready: schemaReadiness?.ready === true,
    schema_issues: schemaReadiness?.issues ?? [],
    legacy_expected_count: definitions.length,
    legacy_missing_codes: legacyMissingCodes,
    legacy_db_sku_missing: definitions.length > 0 && legacyMissingCodes.length > 0,
    supplier_unbound_count: supplierRows.filter((row) => !row.supplier_bound).length,
    supplier_stale_count: supplierRows.filter((row) => row.supplier_stock_stale).length,
    supplier_problem_count: supplierRows.filter((row) => ["partial", "error", "needs_sku"].includes(String(row.supplier_stock_sync_status))).length,
    supplier_rows: supplierRows,
    summary,
  };
}
