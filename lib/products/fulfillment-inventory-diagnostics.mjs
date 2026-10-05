import {
  evaluateSkuActivationReadiness,
  getEffectiveSkuDeliveryType,
  getSupplierStockEvidence,
  SKU_ACTIVATION_REASON_LABELS,
  validSupplierStockTimestamp,
} from "./sku-activation-readiness.mjs";

const INVENTORY_BATCH_SIZE = 200;
const INVENTORY_BATCH_ROW_LIMIT = 5000;
const SUPPLIER_ERROR_STATES = new Set(["error", "partial", "needs_sku"]);

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isRecordOrEmpty(value) {
  return value === null || value === undefined || (typeof value === "object" && !Array.isArray(value));
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function safeProvider(value) {
  return typeof value === "string" && /^[a-z0-9_-]{1,40}$/i.test(value.trim()) ? value.trim() : null;
}

export function getSupplierDiagnosticState(metadataValue) {
  if (!isRecordOrEmpty(metadataValue)) return "error";
  const metadata = record(metadataValue);
  const evidence = getSupplierStockEvidence(metadata);
  if (!evidence.supplier_requested) return "not_applicable";
  if (SUPPLIER_ERROR_STATES.has(String(evidence.sync_status))) return "error";
  if (evidence.stale) return "stale";
  if (evidence.sync_status === "synced" && evidence.last_success_at) return "fresh";
  return "unknown";
}

export function buildSkuOperationalDiagnostic({
  product,
  sku,
  localAvailableCount = 0,
  localInventoryError = false,
  activationReadiness,
  now = Date.now(),
}) {
  const metadataValid = isRecordOrEmpty(sku?.metadata);
  const metadata = record(sku?.metadata);
  const effectiveDeliveryType = getEffectiveSkuDeliveryType(product, sku);
  const localCount = nonNegativeInteger(localAvailableCount);
  const supplierEvidence = getSupplierStockEvidence(metadata);
  const supplierState = getSupplierDiagnosticState(sku?.metadata);
  const timestampMalformed = [metadata.supplier_stock_last_success_at, metadata.supplier_stock_sync_attempted_at]
    .some((value) => value !== null && value !== undefined && !validSupplierStockTimestamp(value));
  // The existing activation guard only evaluates automatic fulfillment. Do not
  // change the evaluator or impose automatic-source rules on manual/shipping.
  const automaticReadiness = activationReadiness ?? evaluateSkuActivationReadiness({
    product,
    sku,
    localAvailableCount: localCount,
    localInventoryError,
  });
  const readiness = ["manual", "shipping"].includes(effectiveDeliveryType)
    ? { ready: true, reasons: [] }
    : automaticReadiness;
  const localReady = !localInventoryError && localCount > 0;
  const supplierReady = supplierEvidence.ready && supplierEvidence.snapshot === nonNegativeInteger(sku?.stock);

  let fulfillmentSource = "unknown";
  if (effectiveDeliveryType === "manual") fulfillmentSource = "manual";
  else if (effectiveDeliveryType === "shipping") fulfillmentSource = "shipping";
  else if (effectiveDeliveryType === "automatic") {
    if (!metadataValid || localInventoryError) fulfillmentSource = "unknown";
    else if (localReady && supplierReady) fulfillmentSource = "hybrid";
    else if (supplierReady) fulfillmentSource = "supplier";
    else if (localReady) fulfillmentSource = "local_inventory";
    else fulfillmentSource = "none";
  }

  const verificationRequired = metadata.inventory_state === "requires_verification";
  let health = "unknown";
  if (metadataValid && !localInventoryError && !timestampMalformed) {
    if (!readiness.ready) health = "blocked";
    else if (verificationRequired || (supplierEvidence.supplier_requested && supplierState !== "fresh")) health = "attention";
    else health = "ready";
  }

  const checkedAt = supplierEvidence.last_success_at;
  const checkedAtMs = checkedAt ? Date.parse(checkedAt) : Number.NaN;
  const ageSeconds = Number.isFinite(checkedAtMs) && Number.isFinite(now)
    ? Math.max(0, Math.floor((Number(now) - checkedAtMs) / 1000))
    : null;
  const diagnosticFailed = !metadataValid || localInventoryError || timestampMalformed;
  const reasons = Array.isArray(readiness.reasons)
    ? readiness.reasons.filter((reason) => Object.hasOwn(SKU_ACTIVATION_REASON_LABELS, reason)) : [];
  if (diagnosticFailed && !reasons.includes("READINESS_CHECK_FAILED")) reasons.push("READINESS_CHECK_FAILED");
  const nextActions = [];
  if (reasons.includes("READINESS_CHECK_FAILED") || !metadataValid) nextActions.push("RETRY_DIAGNOSTICS");
  if (reasons.includes("ZERO_STOCK")) nextActions.push("VERIFY_STOCK");
  if (reasons.includes("LOCAL_INVENTORY_EMPTY") || reasons.includes("NO_FULFILLMENT_SOURCE")) nextActions.push("ADD_LOCAL_INVENTORY_OR_BIND_SUPPLIER");
  if (reasons.includes("SUPPLIER_BINDING_INCOMPLETE")) nextActions.push("COMPLETE_SUPPLIER_BINDING");
  if (reasons.includes("SUPPLIER_STOCK_UNVERIFIED")) nextActions.push("REFRESH_SUPPLIER_STOCK_EVIDENCE");
  if (reasons.includes("INVENTORY_REQUIRES_VERIFICATION") || verificationRequired) nextActions.push("VERIFY_INVENTORY");

  return {
    sku_id: String(sku?.id ?? ""),
    sku_code: sku?.sku_code ? String(sku.sku_code) : null,
    sku_title: sku?.sku_title ? String(sku.sku_title) : null,
    status: typeof sku?.status === "string" ? sku.status : "draft",
    delivery_type: typeof sku?.delivery_type === "string" ? sku.delivery_type : null,
    effective_delivery_type: effectiveDeliveryType,
    stock: nonNegativeInteger(sku?.stock),
    fulfillment_source: fulfillmentSource,
    local_inventory: {
      available_count: localInventoryError ? null : localCount,
      state: localInventoryError ? "error" : localCount > 0 ? "available" : "empty",
    },
    supplier: {
      bound: supplierEvidence.binding_complete,
      binding_complete: supplierEvidence.binding_complete,
      provider: safeProvider(metadata.supplier),
      supplier_product_id_present: metadata.supplier_product_id !== null && metadata.supplier_product_id !== undefined,
      supplier_sku_id_present: typeof metadata.supplier_sku === "string" && metadata.supplier_sku.trim().length > 0,
    },
    supplier_stock: {
      state: supplierState,
      quantity: supplierEvidence.snapshot,
      checked_at: checkedAt,
      age_seconds: ageSeconds,
      error_code: supplierState === "error" ? String(supplierEvidence.sync_status ?? "SUPPLIER_DIAGNOSTIC_ERROR") : null,
    },
    verification: { required: verificationRequired },
    activation: { ready: !diagnosticFailed && readiness.ready === true, reasons },
    health,
    next_actions: [...new Set(nextActions)],
    diagnostic_issues: [
      ...(!metadataValid ? ["MALFORMED_METADATA"] : []),
      ...(timestampMalformed ? ["MALFORMED_SUPPLIER_TIMESTAMP"] : []),
      ...(localInventoryError ? ["LOCAL_INVENTORY_READ_FAILED"] : []),
    ],
  };
}

export function summarizeSkuOperationalDiagnostics(rows) {
  const diagnostics = Array.isArray(rows) ? rows : [];
  return {
    ready: diagnostics.filter((row) => row.health === "ready").length,
    attention: diagnostics.filter((row) => row.health === "attention").length,
    blocked: diagnostics.filter((row) => row.health === "blocked").length,
    unknown: diagnostics.filter((row) => row.health === "unknown").length,
    no_source: diagnostics.filter((row) => row.fulfillment_source === "none").length,
    local_inventory_available: diagnostics.filter((row) => (row.local_inventory.available_count ?? 0) > 0).length,
    supplier_bound: diagnostics.filter((row) => row.supplier.binding_complete).length,
  };
}

export async function readSkuLocalInventoryDiagnostics(service, skuRows) {
  const rows = Array.isArray(skuRows) ? skuRows : [];
  const ids = [...new Set(rows.map((row) => String(row?.id ?? "")).filter(Boolean))];
  if (ids.length === 0) return { availableBySku: {}, queryCount: 0, error: false, overflow: false };
  const productIdsBySku = new Map(rows.map((row) => [String(row?.id ?? ""), String(row?.product_id ?? "")]));
  const batches = [];
  for (let index = 0; index < ids.length; index += INVENTORY_BATCH_SIZE) batches.push(ids.slice(index, index + INVENTORY_BATCH_SIZE));
  let queryCount = 0;
  const availableBySku = {};
  try { for (const batch of batches) {
    const productIds = [...new Set(batch.map((skuId) => productIdsBySku.get(skuId)).filter(Boolean))];
    let offset = 0;
    let total = null;
    const seen = new Set();
    do {
      queryCount += 1;
      const result = await service.from("digital_inventory")
      .select("id,product_id,sku_id", { count: "exact" })
      .in("product_id", productIds)
      .in("sku_id", batch)
      .eq("status", "available")
      .order("id")
      .range(offset, offset + 999);
      if (result.error || !Number.isSafeInteger(result.count) || result.count < 0 || !Array.isArray(result.data)) throw new Error("INVENTORY_READ_FAILED");
      if (result.count >= INVENTORY_BATCH_ROW_LIMIT) return { availableBySku: {}, queryCount, error: true, overflow: true };
      if (total !== null && result.count !== total) throw new Error("INVENTORY_CHANGED_DURING_SCAN");
      total = result.count;
      if (offset + result.data.length > total || (!result.data.length && offset < total)) throw new Error("INVENTORY_INCOMPLETE_SCAN");
      for (const row of result.data) {
        const skuId = String(row?.sku_id ?? "");
        const inventoryId = String(row?.id ?? "");
        if (!inventoryId || seen.has(inventoryId) || !batch.includes(skuId) || productIdsBySku.get(skuId) !== String(row?.product_id ?? "")) throw new Error("INVENTORY_IDENTITY_MISMATCH");
        seen.add(inventoryId);
        availableBySku[skuId] = nonNegativeInteger(availableBySku[skuId]) + 1;
      }
      offset += result.data.length;
    } while (offset < total);
  } } catch {
    return { availableBySku: {}, queryCount, error: true, overflow: false };
  }
  return { availableBySku, queryCount, error: false, overflow: false };
}
