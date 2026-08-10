function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function parseLocalStockPriorityReservation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.ok !== true) return null;
  const localReadyCount = nonNegativeInteger(value.local_ready_count);
  const supplierFallbackCount = nonNegativeInteger(value.supplier_fallback_count);
  const blockedCount = nonNegativeInteger(value.blocked_count);
  if (localReadyCount === null || supplierFallbackCount === null || blockedCount === null) return null;
  return { localReadyCount, supplierFallbackCount, blockedCount };
}

export async function runLocalStockPriorityDelivery(input) {
  const reservation = parseLocalStockPriorityReservation(await input.reserveLocal());
  if (!reservation) throw new Error("LOCAL_STOCK_PRIORITY_RESULT_INVALID");
  if (reservation.blockedCount > 0) throw new Error("LOCAL_STOCK_PRIORITY_STATE_BLOCKED");
  const local = await input.deliverLocal();
  const supplier = await input.deliverSupplier();
  return { reservation, local, supplier };
}
