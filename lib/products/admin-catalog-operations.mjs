import { getSupplierStockEvidence } from "./sku-activation-readiness.mjs";

export const ADMIN_CATALOG_FILTER_VALUES = Object.freeze({
  productType: ["all", "single_product", "multi_sku"],
  productStatus: ["all", "draft", "active", "inactive", "sold_out"],
  deliveryType: ["all", "manual", "automatic", "shipping"],
  skuStatus: ["any", "has_active_sku", "all_draft", "has_sold_out_sku", "no_active_sku"],
  stockLevel: ["all", "zero_stock", "low_stock", "in_stock"],
  supplierBinding: ["all", "supplier_bound", "supplier_unbound"],
  supplierStock: ["all", "unknown", "fresh", "stale", "error"],
  inventoryVerification: ["all", "requires_verification", "no_verification_flag"],
  sortBy: ["sort_order", "updated_at"],
});

export const DEFAULT_ADMIN_CATALOG_FILTERS = Object.freeze({
  search: "",
  productType: "all",
  productStatus: "all",
  deliveryType: "all",
  skuStatus: "any",
  stockLevel: "all",
  supplierBinding: "all",
  supplierStock: "all",
  inventoryVerification: "all",
  sortBy: "updated_at",
  page: 1,
  pageSize: 20,
});

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function enumValue(params, queryName, key, fallback, invalid) {
  const raw = params.get(queryName);
  if (raw === null || raw === "") return fallback;
  if (ADMIN_CATALOG_FILTER_VALUES[key].includes(raw)) return raw;
  invalid.push(queryName);
  return fallback;
}

function boundedInteger(raw, fallback, min, max) {
  if (raw === null || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) return fallback;
  return Math.min(max, Math.max(min, Number(raw)));
}

function stockLevelValue(params, invalid) {
  const raw = params.get("stockLevel");
  if (raw === "low") return "low_stock";
  return enumValue(params, "stockLevel", "stockLevel", "all", invalid);
}

export function parseAdminCatalogOperationFilters(params) {
  const invalid = [];
  const filters = {
    search: String(params.get("search") ?? "").trim().slice(0, 120),
    productType: enumValue(params, "type", "productType", "all", invalid),
    productStatus: enumValue(params, "status", "productStatus", "all", invalid),
    deliveryType: enumValue(params, "deliveryType", "deliveryType", "all", invalid),
    skuStatus: enumValue(params, "skuStatus", "skuStatus", "any", invalid),
    stockLevel: stockLevelValue(params, invalid),
    supplierBinding: enumValue(params, "supplierBinding", "supplierBinding", "all", invalid),
    supplierStock: enumValue(params, "supplierStock", "supplierStock", "all", invalid),
    inventoryVerification: enumValue(params, "inventoryVerification", "inventoryVerification", "all", invalid),
    sortBy: enumValue(params, "sortBy", "sortBy", "updated_at", invalid),
    page: boundedInteger(params.get("page"), 1, 1, 100000),
    pageSize: boundedInteger(params.get("pageSize"), 20, 1, 100),
  };
  return { ok: invalid.length === 0, invalid, filters };
}

export function serializeAdminCatalogFilterState(state) {
  const params = new URLSearchParams();
  const setNonDefault = (name, value, fallback) => {
    if (value !== undefined && value !== null && String(value) !== "" && value !== fallback) {
      params.set(name, String(value));
    }
  };
  setNonDefault("view", state.view, "products");
  setNonDefault("search", String(state.search ?? "").trim(), "");
  setNonDefault("primaryCategory", state.primaryCategory, "all");
  setNonDefault("secondaryCategory", state.secondaryCategory, "all");
  setNonDefault("type", state.productType, "all");
  setNonDefault("status", state.productStatus, "all");
  setNonDefault("deliveryType", state.deliveryType, "all");
  setNonDefault("skuStatus", state.skuStatus, "any");
  setNonDefault("stockLevel", state.stockLevel, "all");
  setNonDefault("supplierBinding", state.supplierBinding, "all");
  setNonDefault("supplierStock", state.supplierStock, "all");
  setNonDefault("inventoryVerification", state.inventoryVerification, "all");
  setNonDefault("sortBy", state.sortBy, "updated_at");
  const page = boundedInteger(String(state.page ?? 1), 1, 1, 100000);
  const pageSize = boundedInteger(String(state.pageSize ?? 20), 20, 1, 100);
  if (page > 1) params.set("page", String(page));
  if (pageSize !== 20) params.set("pageSize", String(pageSize));
  return params;
}

export function getSupplierOperationalStockState(metadataValue) {
  const evidence = getSupplierStockEvidence(record(metadataValue));
  if (["error", "partial", "needs_sku"].includes(String(evidence.sync_status))) return "error";
  if (evidence.stale) return "stale";
  if (evidence.sync_status === "synced" && evidence.last_success_at) return "fresh";
  return "unknown";
}

export function buildAdminProductOperationalSummary(product, skuRows = []) {
  const hasSkus = product?.has_skus === true;
  const rows = hasSkus && Array.isArray(skuRows) ? skuRows : [];
  const productMetadata = record(product?.metadata);
  const activeRows = rows.filter((row) => row?.status === "active");
  const draftCount = rows.filter((row) => row?.status === "draft").length;
  const soldOutCount = rows.filter((row) => row?.status === "sold_out").length;
  const effectiveStock = hasSkus
    ? activeRows.reduce((sum, row) => sum + nonNegativeInteger(row?.stock), 0)
    : nonNegativeInteger(product?.stock);
  const supplierEvidence = hasSkus
    ? rows.map((row) => getSupplierStockEvidence(record(row?.metadata)))
    : [getSupplierStockEvidence(productMetadata)];
  const supplierStates = hasSkus
    ? rows.map((row) => getSupplierOperationalStockState(row?.metadata))
    : [getSupplierOperationalStockState(productMetadata)];
  if (hasSkus && rows.length === 0) supplierStates.push("unknown");
  const supplierUnbound = supplierEvidence.filter((evidence) => !evidence.binding_complete).length;
  const requiresVerification = hasSkus
    ? rows.filter((row) => record(row?.metadata).inventory_state === "requires_verification").length
    : productMetadata.inventory_state === "requires_verification" ? 1 : 0;

  return {
    sku_total: rows.length,
    sku_active: activeRows.length,
    sku_draft: draftCount,
    sku_sold_out: soldOutCount,
    effective_stock: effectiveStock,
    supplier_unbound: supplierUnbound,
    supplier_bound: hasSkus
      ? rows.length > 0 && supplierUnbound === 0
      : supplierEvidence[0]?.binding_complete === true,
    requires_verification: requiresVerification,
    supplier_stock_unknown: supplierStates.filter((state) => state === "unknown").length,
    supplier_stock_fresh: supplierStates.filter((state) => state === "fresh").length,
    supplier_stock_stale: supplierStates.filter((state) => state === "stale").length,
    supplier_stock_error: supplierStates.filter((state) => state === "error").length,
  };
}

export function hasOperationalScanFilters(filters) {
  return filters.skuStatus !== "any"
    || filters.stockLevel !== "all"
    || filters.supplierBinding !== "all"
    || filters.supplierStock !== "all"
    || filters.inventoryVerification !== "all";
}

export function matchesAdminCatalogOperations(product, summary, filters) {
  const hasSkus = product?.has_skus === true;
  const search = String(filters.search ?? "").trim().toLowerCase();
  if (search && !`${String(product?.name ?? "")} ${String(product?.slug ?? "")}`.toLowerCase().includes(search)) return false;
  if (filters.productType === "multi_sku" && !hasSkus) return false;
  if (filters.productType === "single_product" && hasSkus) return false;
  if (filters.productStatus !== "all" && product?.status !== filters.productStatus) return false;
  if (filters.deliveryType !== "all" && product?.delivery_type !== filters.deliveryType) return false;

  if (filters.skuStatus !== "any") {
    if (!hasSkus) return false;
    if (filters.skuStatus === "has_active_sku" && summary.sku_active <= 0) return false;
    if (filters.skuStatus === "all_draft" && !(summary.sku_total > 0 && summary.sku_draft === summary.sku_total)) return false;
    if (filters.skuStatus === "has_sold_out_sku" && summary.sku_sold_out <= 0) return false;
    if (filters.skuStatus === "no_active_sku" && summary.sku_active > 0) return false;
  }

  if (filters.stockLevel === "zero_stock" && summary.effective_stock !== 0) return false;
  if (filters.stockLevel === "low_stock" && !(summary.effective_stock >= 1 && summary.effective_stock <= 5)) return false;
  if (filters.stockLevel === "in_stock" && summary.effective_stock <= 0) return false;
  if (filters.supplierBinding === "supplier_bound" && !summary.supplier_bound) return false;
  if (filters.supplierBinding === "supplier_unbound" && summary.supplier_unbound <= 0) return false;
  if (filters.supplierStock !== "all" && summary[`supplier_stock_${filters.supplierStock}`] <= 0) return false;
  if (filters.inventoryVerification === "requires_verification" && summary.requires_verification <= 0) return false;
  if (filters.inventoryVerification === "no_verification_flag" && summary.requires_verification > 0) return false;
  return true;
}

export function decorateAdminCatalogProducts(products, skuRows, filters) {
  const byProduct = new Map();
  for (const row of Array.isArray(skuRows) ? skuRows : []) {
    const productId = String(row?.product_id ?? "");
    if (!byProduct.has(productId)) byProduct.set(productId, []);
    byProduct.get(productId).push(row);
  }
  return (Array.isArray(products) ? products : []).map((product) => {
    const operationalSummary = buildAdminProductOperationalSummary(product, byProduct.get(String(product?.id ?? "")) ?? []);
    return { ...product, operational_summary: operationalSummary };
  }).filter((product) => matchesAdminCatalogOperations(product, product.operational_summary, filters));
}

export function filterAndPaginateAdminCatalogProducts(products, skuRows, filters) {
  const decorated = decorateAdminCatalogProducts(products, skuRows, filters);
  const from = (filters.page - 1) * filters.pageSize;
  return { products: decorated.slice(from, from + filters.pageSize), count: decorated.length };
}
