function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function stageError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function notify(onStage, stage, error = null) {
  try {
    onStage?.({ stage, error });
  } catch {
    // Diagnostics must never change fulfillment behavior.
  }
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
  if (!reservation) {
    const error = stageError("LOCAL_RESERVATION_RESULT_INVALID");
    notify(input.onStage, "LOCAL_RESERVATION_RESULT_INVALID", error);
    throw error;
  }
  if (reservation.blockedCount > 0) {
    const error = stageError("LOCAL_PRIORITY_BLOCKED");
    notify(input.onStage, "LOCAL_PRIORITY_BLOCKED", error);
    throw error;
  }
  const local = await input.deliverLocal();
  const supplier = await input.deliverSupplier();
  return { reservation, local, supplier };
}
