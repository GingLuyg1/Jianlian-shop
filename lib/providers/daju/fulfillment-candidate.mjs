import { parseDajuProductBinding } from "./mapper.mjs";

const AUTOMATIC_DELIVERY_TYPES = new Set([
  "automatic",
  "auto",
  "card",
  "account",
  "auto_delivery",
]);

function isPlainRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Once an order item exists, product_snapshot.supplier_binding is the only
// supplier-routing authority. A missing/null binding is a legacy local item;
// current product or SKU metadata must never be consulted as a fallback.
export function classifyDajuFulfillmentCandidate(item) {
  if (!isPlainRecord(item) || !AUTOMATIC_DELIVERY_TYPES.has(String(item.delivery_type))) {
    return { kind: "skip", reason: "NOT_AUTOMATIC" };
  }

  const snapshot = isPlainRecord(item.product_snapshot) ? item.product_snapshot : null;
  if (!snapshot || !Object.prototype.hasOwnProperty.call(snapshot, "supplier_binding") || snapshot.supplier_binding === null) {
    return { kind: "skip", reason: "LEGACY_LOCAL" };
  }

  const snapshotBinding = snapshot.supplier_binding;
  if (isPlainRecord(snapshotBinding) && typeof snapshotBinding.supplier === "string" && snapshotBinding.supplier !== "daju") {
    return { kind: "skip", reason: "OTHER_SUPPLIER" };
  }

  const binding = parseDajuProductBinding(snapshotBinding);
  if (!binding) {
    return { kind: "validation", reason: "SUPPLIER_BINDING_INVALID", binding: null };
  }

  return { kind: "daju", binding };
}
