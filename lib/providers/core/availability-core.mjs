export const SUPPLIER_AVAILABILITY = Object.freeze({
  AVAILABLE: "AVAILABLE",
  UNAVAILABLE: "UNAVAILABLE",
  UNKNOWN: "UNKNOWN",
});
const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

function unknown() {
  return { state: SUPPLIER_AVAILABILITY.UNKNOWN, quantity: null, quantityKnown: false, purchasable: false };
}

// Evidence is provider-neutral. A quantity provider must supply an exact integer;
// a boolean provider must never turn its in-stock flag into an invented quantity.
export function evaluateSupplierAvailability(snapshot, nowMs, maxAgeMs) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)
      || !Number.isSafeInteger(nowMs) || !Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0
      || snapshot.error_state || snapshot.freshness?.supplier_stock_stale !== false
      || snapshot.freshness?.supplier_stock_sync_status !== "synced") return unknown();
  const checkedAt = typeof snapshot.checked_at === "string" && CANONICAL_TIMESTAMP.test(snapshot.checked_at)
    ? Date.parse(snapshot.checked_at) : NaN;
  if (!Number.isFinite(checkedAt) || checkedAt > nowMs || nowMs - checkedAt > maxAgeMs) return unknown();

  if (snapshot.supplier_quantity_known === true) {
    const quantity = snapshot.quantity;
    if (!Number.isSafeInteger(quantity) || quantity < 0) return unknown();
    if (snapshot.available !== undefined && snapshot.available !== (quantity > 0)) return unknown();
    return { state: quantity > 0 ? SUPPLIER_AVAILABILITY.AVAILABLE : SUPPLIER_AVAILABILITY.UNAVAILABLE,
      quantity, quantityKnown: true, purchasable: quantity > 0 };
  }
  if (snapshot.supplier_quantity_known === false && snapshot.quantity === null
      && typeof snapshot.available === "boolean") {
    return { state: snapshot.available ? SUPPLIER_AVAILABILITY.AVAILABLE : SUPPLIER_AVAILABILITY.UNAVAILABLE,
      quantity: null, quantityKnown: false, purchasable: snapshot.available };
  }
  return unknown();
}
