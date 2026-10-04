const supplier = {
  fulfillment_source: "supplier",
  supplier: "daju",
  supplier_product_id: 15,
  supplier_sku: "13",
  supplier_inputs_mapping: {},
  supplier_max_unit_cost: "8.50",
  supplier_stock_snapshot: 7,
  supplier_stock_sync_status: "synced",
  supplier_stock_last_success_at: "2026-10-01T00:00:00Z",
  supplier_stock_stale: false,
};

export const ACTIVATION_READINESS_FIXTURES = Object.freeze([
  { name: "LOCAL_READY", stock: 1, metadata: {}, localAvailableCount: 1, ready: true, reasons: [] },
  { name: "LOCAL_EMPTY", stock: 1, metadata: {}, localAvailableCount: 0, ready: false, reasons: ["LOCAL_INVENTORY_EMPTY", "NO_FULFILLMENT_SOURCE"] },
  { name: "ZERO_STOCK", stock: 0, metadata: {}, localAvailableCount: 1, ready: false, reasons: ["ZERO_STOCK"] },
  { name: "LOCAL_WRONG_SKU", stock: 1, metadata: {}, localAvailableCount: 0, ready: false, reasons: ["LOCAL_INVENTORY_EMPTY", "NO_FULFILLMENT_SOURCE"] },
  { name: "LOCAL_RESERVED", stock: 1, metadata: {}, localAvailableCount: 0, ready: false, reasons: ["LOCAL_INVENTORY_EMPTY", "NO_FULFILLMENT_SOURCE"] },
  { name: "SUPPLIER_READY", stock: 7, metadata: supplier, localAvailableCount: 0, ready: true, reasons: [] },
  { name: "SUPPLIER_PARENT_ONLY", stock: 7, metadata: {}, localAvailableCount: 0, ready: false, reasons: ["LOCAL_INVENTORY_EMPTY", "NO_FULFILLMENT_SOURCE"] },
  { name: "SUPPLIER_WRONG_SKU_STOCK", stock: 6, metadata: supplier, localAvailableCount: 0, ready: false, reasons: ["SUPPLIER_STOCK_UNVERIFIED", "NO_FULFILLMENT_SOURCE"] },
  { name: "SUPPLIER_UNTRUSTED", stock: 7, metadata: { ...supplier, supplier_stock_sync_status: "error" }, localAvailableCount: 0, ready: false, reasons: ["SUPPLIER_STOCK_UNVERIFIED", "NO_FULFILLMENT_SOURCE"] },
  { name: "SUPPLIER_STALE", stock: 7, metadata: { ...supplier, supplier_stock_stale: true }, localAvailableCount: 0, ready: false, reasons: ["SUPPLIER_STOCK_UNVERIFIED", "NO_FULFILLMENT_SOURCE"] },
  { name: "SUPPLIER_ZERO", stock: 7, metadata: { ...supplier, supplier_stock_snapshot: 0 }, localAvailableCount: 0, ready: false, reasons: ["SUPPLIER_STOCK_UNVERIFIED", "NO_FULFILLMENT_SOURCE"] },
  { name: "REQUIRES_VERIFICATION_NO_EVIDENCE", stock: 1, metadata: { inventory_state: "requires_verification" }, localAvailableCount: 0, ready: false, reasons: ["LOCAL_INVENTORY_EMPTY", "NO_FULFILLMENT_SOURCE", "INVENTORY_REQUIRES_VERIFICATION"] },
  { name: "REQUIRES_VERIFICATION_WITH_TRUSTED_LOCAL", stock: 1, metadata: { inventory_state: "requires_verification" }, localAvailableCount: 1, ready: true, reasons: [] },
]);
