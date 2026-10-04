const SUPPLIER_BINDING_BLOCKED = ["SUPPLIER_BINDING_INCOMPLETE", "NO_FULFILLMENT_SOURCE"];
const SUPPLIER_EVIDENCE_BLOCKED = ["SUPPLIER_STOCK_UNVERIFIED", "NO_FULFILLMENT_SOURCE"];

function supplierJson({
  productId = "15",
  snapshot = "7",
  timestamp = '"2026-10-01T00:00:00Z"',
  syncStatus = '"synced"',
  stale = "false",
  omitProductId = false,
  omitSnapshot = false,
  omitTimestamp = false,
} = {}) {
  return `{"fulfillment_source":"supplier","supplier":"daju",${omitProductId ? "" : `"supplier_product_id":${productId},`}"supplier_sku":"13","supplier_inputs_mapping":{},"supplier_max_unit_cost":"8.50",${omitSnapshot ? "" : `"supplier_stock_snapshot":${snapshot},`}"supplier_stock_sync_status":${syncStatus},${omitTimestamp ? "" : `"supplier_stock_last_success_at":${timestamp},`}"supplier_stock_stale":${stale}}`;
}

function fixture(input) {
  const metadataJson = input.metadataJson ?? JSON.stringify(input.metadata ?? {});
  return Object.freeze({ ...input, metadataJson, metadata: JSON.parse(metadataJson) });
}

export const ACTIVATION_READINESS_FIXTURES = Object.freeze([
  fixture({ name: "LOCAL_READY", stock: 1, metadata: {}, localAvailableCount: 1, ready: true, reasons: [] }),
  fixture({ name: "LOCAL_EMPTY", stock: 1, metadata: {}, localAvailableCount: 0, ready: false, reasons: ["LOCAL_INVENTORY_EMPTY", "NO_FULFILLMENT_SOURCE"] }),
  fixture({ name: "ZERO_STOCK", stock: 0, metadata: {}, localAvailableCount: 1, ready: false, reasons: ["ZERO_STOCK"] }),
  fixture({ name: "LOCAL_WRONG_SKU", stock: 1, metadata: {}, localAvailableCount: 0, ready: false, reasons: ["LOCAL_INVENTORY_EMPTY", "NO_FULFILLMENT_SOURCE"] }),
  fixture({ name: "LOCAL_RESERVED", stock: 1, metadata: {}, localAvailableCount: 0, ready: false, reasons: ["LOCAL_INVENTORY_EMPTY", "NO_FULFILLMENT_SOURCE"] }),
  fixture({ name: "SUPPLIER_READY", stock: 7, metadataJson: supplierJson(), localAvailableCount: 0, ready: true, reasons: [] }),
  fixture({ name: "SUPPLIER_PARENT_ONLY", stock: 7, metadata: {}, localAvailableCount: 0, ready: false, reasons: ["LOCAL_INVENTORY_EMPTY", "NO_FULFILLMENT_SOURCE"] }),
  fixture({ name: "SUPPLIER_WRONG_SKU_STOCK", stock: 6, metadataJson: supplierJson(), localAvailableCount: 0, ready: false, reasons: SUPPLIER_EVIDENCE_BLOCKED }),
  fixture({ name: "SUPPLIER_UNTRUSTED", stock: 7, metadataJson: supplierJson({ syncStatus: '"error"' }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_EVIDENCE_BLOCKED }),
  fixture({ name: "SUPPLIER_STALE", stock: 7, metadataJson: supplierJson({ stale: "true" }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_EVIDENCE_BLOCKED }),
  fixture({ name: "SUPPLIER_ZERO", stock: 7, metadataJson: supplierJson({ snapshot: "0" }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_EVIDENCE_BLOCKED }),
  fixture({ name: "REQUIRES_VERIFICATION_NO_EVIDENCE", stock: 1, metadata: { inventory_state: "requires_verification" }, localAvailableCount: 0, ready: false, reasons: ["LOCAL_INVENTORY_EMPTY", "NO_FULFILLMENT_SOURCE", "INVENTORY_REQUIRES_VERIFICATION"] }),
  fixture({ name: "REQUIRES_VERIFICATION_WITH_TRUSTED_LOCAL", stock: 1, metadata: { inventory_state: "requires_verification" }, localAvailableCount: 1, ready: true, reasons: [] }),

  // Canonical JSON number contract for supplier_product_id.
  fixture({ name: "PRODUCT_ID_DECIMAL_INTEGER", stock: 7, metadataJson: supplierJson({ productId: "15.0" }), localAvailableCount: 0, ready: true, reasons: [] }),
  fixture({ name: "PRODUCT_ID_EXPONENT_INTEGER", stock: 7, metadataJson: supplierJson({ productId: "1e3" }), localAvailableCount: 0, ready: true, reasons: [] }),
  fixture({ name: "PRODUCT_ID_SAFE_MAX", stock: 7, metadataJson: supplierJson({ productId: "9007199254740991" }), localAvailableCount: 0, ready: true, reasons: [] }),
  fixture({ name: "PRODUCT_ID_STRING", stock: 7, metadataJson: supplierJson({ productId: '"15"' }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_BINDING_BLOCKED }),
  fixture({ name: "PRODUCT_ID_BOOLEAN", stock: 7, metadataJson: supplierJson({ productId: "true" }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_BINDING_BLOCKED }),
  fixture({ name: "PRODUCT_ID_FRACTIONAL", stock: 7, metadataJson: supplierJson({ productId: "15.1" }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_BINDING_BLOCKED }),
  fixture({ name: "PRODUCT_ID_ZERO", stock: 7, metadataJson: supplierJson({ productId: "0" }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_BINDING_BLOCKED }),
  fixture({ name: "PRODUCT_ID_NEGATIVE", stock: 7, metadataJson: supplierJson({ productId: "-1" }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_BINDING_BLOCKED }),
  fixture({ name: "PRODUCT_ID_UNSAFE", stock: 7, metadataJson: supplierJson({ productId: "9007199254740992" }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_BINDING_BLOCKED }),
  fixture({ name: "PRODUCT_ID_EXTREME", stock: 7, metadataJson: supplierJson({ productId: "1e100" }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_BINDING_BLOCKED }),
  fixture({ name: "PRODUCT_ID_NULL", stock: 7, metadataJson: supplierJson({ productId: "null" }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_BINDING_BLOCKED }),
  fixture({ name: "PRODUCT_ID_MISSING", stock: 7, metadataJson: supplierJson({ omitProductId: true }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_BINDING_BLOCKED }),

  // Canonical JSON number contract for supplier_stock_snapshot.
  fixture({ name: "SNAPSHOT_DECIMAL_INTEGER", stock: 7, metadataJson: supplierJson({ snapshot: "7.0" }), localAvailableCount: 0, ready: true, reasons: [] }),
  fixture({ name: "SNAPSHOT_EXPONENT_INTEGER", stock: 1000, metadataJson: supplierJson({ snapshot: "1e3" }), localAvailableCount: 0, ready: true, reasons: [] }),
  fixture({ name: "SNAPSHOT_INT4_MAX", stock: 2147483647, metadataJson: supplierJson({ snapshot: "2147483647" }), localAvailableCount: 0, ready: true, reasons: [] }),
  fixture({ name: "SNAPSHOT_SAFE_MAX_MISMATCH", stock: 7, metadataJson: supplierJson({ snapshot: "9007199254740991" }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_EVIDENCE_BLOCKED }),
  fixture({ name: "SNAPSHOT_STRING", stock: 7, metadataJson: supplierJson({ snapshot: '"7"' }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_EVIDENCE_BLOCKED }),
  fixture({ name: "SNAPSHOT_BOOLEAN_TRUE", stock: 1, metadataJson: supplierJson({ snapshot: "true" }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_EVIDENCE_BLOCKED }),
  fixture({ name: "SNAPSHOT_BOOLEAN_FALSE", stock: 1, metadataJson: supplierJson({ snapshot: "false" }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_EVIDENCE_BLOCKED }),
  fixture({ name: "SNAPSHOT_NULL", stock: 7, metadataJson: supplierJson({ snapshot: "null" }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_EVIDENCE_BLOCKED }),
  fixture({ name: "SNAPSHOT_FRACTIONAL", stock: 7, metadataJson: supplierJson({ snapshot: "7.5" }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_EVIDENCE_BLOCKED }),
  fixture({ name: "SNAPSHOT_NEGATIVE", stock: 7, metadataJson: supplierJson({ snapshot: "-1" }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_EVIDENCE_BLOCKED }),
  fixture({ name: "SNAPSHOT_UNSAFE", stock: 7, metadataJson: supplierJson({ snapshot: "9007199254740992" }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_EVIDENCE_BLOCKED }),
  fixture({ name: "SNAPSHOT_EXTREME", stock: 7, metadataJson: supplierJson({ snapshot: "1e100" }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_EVIDENCE_BLOCKED }),
  fixture({ name: "SNAPSHOT_MISSING", stock: 7, metadataJson: supplierJson({ omitSnapshot: true }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_EVIDENCE_BLOCKED }),

  // Canonical timezone-explicit supplier timestamps.
  fixture({ name: "TIMESTAMP_UTC_SECONDS", stock: 7, metadataJson: supplierJson({ timestamp: '"2026-10-01T00:00:00Z"' }), localAvailableCount: 0, ready: true, reasons: [] }),
  fixture({ name: "TIMESTAMP_UTC_FRACTION", stock: 7, metadataJson: supplierJson({ timestamp: '"2026-10-01T00:00:00.000Z"' }), localAvailableCount: 0, ready: true, reasons: [] }),
  fixture({ name: "TIMESTAMP_OFFSET", stock: 7, metadataJson: supplierJson({ timestamp: '"2026-10-01T08:00:00+08:00"' }), localAvailableCount: 0, ready: true, reasons: [] }),
  fixture({ name: "TIMESTAMP_SPACE", stock: 7, metadataJson: supplierJson({ timestamp: '"2026-10-01 00:00:00"' }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_EVIDENCE_BLOCKED }),
  fixture({ name: "TIMESTAMP_DATE_ONLY", stock: 7, metadataJson: supplierJson({ timestamp: '"2026-10-01"' }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_EVIDENCE_BLOCKED }),
  fixture({ name: "TIMESTAMP_SLASH_DATE", stock: 7, metadataJson: supplierJson({ timestamp: '"01/10/2026"' }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_EVIDENCE_BLOCKED }),
  fixture({ name: "TIMESTAMP_NATURAL_LANGUAGE", stock: 7, metadataJson: supplierJson({ timestamp: '"October 1, 2026"' }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_EVIDENCE_BLOCKED }),
  fixture({ name: "TIMESTAMP_NO_TIMEZONE", stock: 7, metadataJson: supplierJson({ timestamp: '"2026-10-01T00:00:00"' }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_EVIDENCE_BLOCKED }),
  fixture({ name: "TIMESTAMP_INVALID", stock: 7, metadataJson: supplierJson({ timestamp: '"not-a-date"' }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_EVIDENCE_BLOCKED }),
  fixture({ name: "TIMESTAMP_EMPTY", stock: 7, metadataJson: supplierJson({ timestamp: '""' }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_EVIDENCE_BLOCKED }),
  fixture({ name: "TIMESTAMP_NULL", stock: 7, metadataJson: supplierJson({ timestamp: "null" }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_EVIDENCE_BLOCKED }),
  fixture({ name: "TIMESTAMP_NUMBER", stock: 7, metadataJson: supplierJson({ timestamp: "1790812800" }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_EVIDENCE_BLOCKED }),
  fixture({ name: "TIMESTAMP_MISSING", stock: 7, metadataJson: supplierJson({ omitTimestamp: true }), localAvailableCount: 0, ready: false, reasons: SUPPLIER_EVIDENCE_BLOCKED }),
]);
