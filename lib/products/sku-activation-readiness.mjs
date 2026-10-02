import { compareDajuDecimal, parseDajuProductBinding } from "../providers/daju/mapper.mjs";

export const SKU_ACTIVATION_REASON_LABELS = Object.freeze({
  ZERO_STOCK: "SKU 库存必须大于 0",
  NO_FULFILLMENT_SOURCE: "当前无可验证履约来源",
  SUPPLIER_BINDING_INCOMPLETE: "SKU 供应商绑定不完整",
  SUPPLIER_STOCK_UNVERIFIED: "供应商库存尚未完成可信同步",
  LOCAL_INVENTORY_EMPTY: "SKU 级本地数字库存为空",
  INVENTORY_REQUIRES_VERIFICATION: "库存仍处于待验证状态",
  READINESS_CHECK_FAILED: "履约 readiness 无法确认",
});

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function validTimestamp(value) {
  return typeof value === "string" && value.trim() && Number.isFinite(Date.parse(value));
}

export function getEffectiveSkuDeliveryType(product, sku) {
  return String(sku?.delivery_type || product?.delivery_type || "manual");
}

export function isAutomaticSkuActivation(previousStatus, nextStatus, product, sku) {
  return previousStatus !== "active"
    && nextStatus === "active"
    && getEffectiveSkuDeliveryType(product, sku) === "automatic";
}

export function getSupplierStockEvidence(metadataValue) {
  const metadata = record(metadataValue);
  const binding = parseDajuProductBinding(metadata);
  const supplierRequested = metadata.fulfillment_source === "supplier";
  const bindingComplete = Boolean(
    binding
    && binding.maxUnitCost !== null
    && compareDajuDecimal(binding.maxUnitCost, "0") === 1,
  );
  const snapshot = Number(metadata.supplier_stock_snapshot);
  const snapshotValid = Number.isSafeInteger(snapshot) && snapshot > 0;
  const syncStatus = typeof metadata.supplier_stock_sync_status === "string"
    ? metadata.supplier_stock_sync_status
    : null;
  const lastSuccessAt = validTimestamp(metadata.supplier_stock_last_success_at)
    ? metadata.supplier_stock_last_success_at
    : null;
  const stale = metadata.supplier_stock_stale === true;
  const ready = bindingComplete
    && snapshotValid
    && syncStatus === "synced"
    && Boolean(lastSuccessAt)
    && !stale;

  return {
    supplier_requested: supplierRequested,
    binding_complete: bindingComplete,
    snapshot: snapshotValid ? snapshot : null,
    sync_status: syncStatus,
    last_success_at: lastSuccessAt,
    stale,
    ready,
  };
}

export function evaluateSkuActivationReadiness({ product, sku, localAvailableCount = 0, localInventoryError = false }) {
  const metadata = record(sku?.metadata);
  const stock = positiveInteger(sku?.stock);
  const localCount = positiveInteger(localAvailableCount);
  const supplier = getSupplierStockEvidence(metadata);
  const exactSupplierReady = supplier.ready && supplier.snapshot === stock;
  const localInventoryReady = !supplier.supplier_requested && !localInventoryError && localCount > 0;
  const trustedSource = exactSupplierReady || localInventoryReady;
  const reasons = [];

  if (stock <= 0) reasons.push("ZERO_STOCK");
  if (localInventoryError) reasons.push("READINESS_CHECK_FAILED");

  if (supplier.supplier_requested) {
    if (!supplier.binding_complete) reasons.push("SUPPLIER_BINDING_INCOMPLETE");
    else if (!exactSupplierReady) reasons.push("SUPPLIER_STOCK_UNVERIFIED");
  } else if (!localInventoryReady) {
    reasons.push("LOCAL_INVENTORY_EMPTY");
  }

  if (!trustedSource) reasons.push("NO_FULFILLMENT_SOURCE");
  if (metadata.inventory_state === "requires_verification" && !trustedSource) {
    reasons.push("INVENTORY_REQUIRES_VERIFICATION");
  }

  return {
    ready: reasons.length === 0,
    reasons: [...new Set(reasons)],
    source: exactSupplierReady ? "supplier" : localInventoryReady ? "local_inventory" : "none",
    stock,
    local_available_count: localCount,
    supplier,
    inventory_state: typeof metadata.inventory_state === "string" ? metadata.inventory_state : null,
  };
}

export async function readSkuActivationReadiness(service, product, sku) {
  const productId = String(sku?.product_id || product?.id || "");
  const skuId = String(sku?.id || "");
  if (!productId || !skuId) {
    return evaluateSkuActivationReadiness({ product, sku, localAvailableCount: 0 });
  }

  const result = await service
    .from("digital_inventory")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .eq("sku_id", skuId)
    .eq("status", "available");
  if (result.error) {
    return evaluateSkuActivationReadiness({ product, sku, localAvailableCount: 0, localInventoryError: true });
  }
  return evaluateSkuActivationReadiness({ product, sku, localAvailableCount: result.count ?? 0 });
}

export function formatSkuActivationReasons(reasons) {
  return (Array.isArray(reasons) ? reasons : [])
    .map((reason) => SKU_ACTIVATION_REASON_LABELS[reason] ?? reason)
    .join("；");
}

export function summarizeSkuReadiness(skus, diagnosticRows = []) {
  const rows = Array.isArray(skus) ? skus : [];
  const diagnostics = new Map(
    (Array.isArray(diagnosticRows) ? diagnosticRows : []).map((row) => [String(row.sku_id), row]),
  );
  const readiness = rows.map((sku) => diagnostics.get(String(sku.id))?.activation_readiness
    ?? evaluateSkuActivationReadiness({ product: null, sku, localAvailableCount: 0 }));
  return {
    total: rows.length,
    active: rows.filter((row) => row.status === "active").length,
    draft: rows.filter((row) => row.status === "draft").length,
    zero_stock: rows.filter((row) => Number(row.stock ?? 0) <= 0).length,
    supplier_unbound: rows.filter((row) => !getSupplierStockEvidence(row?.metadata).binding_complete).length,
    requires_verification: rows.filter((row) => record(row?.metadata).inventory_state === "requires_verification").length,
    local_inventory_available: readiness.filter((row) => row.local_available_count > 0).length,
    no_verified_source: readiness.filter((row) => row.source === "none").length,
    activation_ready: readiness.filter((row) => row.ready).length,
  };
}
