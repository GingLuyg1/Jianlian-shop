import { fulfillSupplierCandidates, reconcileSupplierExistingCandidate } from "../core/fulfillment-core.mjs";
import { decideDajuError, decideDajuOrderResult, joinDajuDeliveredSecrets } from "./workflow.mjs";

function withDajuAdapter(input) {
  return {
    ...input,
    decideError: decideDajuError,
    decideOrderResult: decideDajuOrderResult,
    extractDeliveredContent: (order) => joinDajuDeliveredSecrets(order?.delivered),
    countDelivered: (order) => Array.isArray(order?.delivered) ? order.delivered.length : 0,
  };
}

function translateDajuCompatibilityError(error) {
  if (!(error instanceof Error)) throw error;
  const map = {
    SUPPLIER_RECONCILIATION_CANDIDATE_INVALID: "DAJU_RECONCILIATION_CANDIDATE_INVALID",
    SUPPLIER_RECONCILIATION_STATE_CHANGED: "DAJU_RECONCILIATION_STATE_CHANGED",
    SUPPLIER_RECONCILIATION_DELIVERY_MISSING: "DAJU_RECONCILIATION_DELIVERY_MISSING",
  };
  const message = map[error.message];
  if (message) throw new Error(message);
  throw error;
}

export async function fulfillDajuCandidates(input) {
  return fulfillSupplierCandidates(withDajuAdapter(input));
}

export async function reconcileDajuExistingCandidate(input) {
  try {
    return await reconcileSupplierExistingCandidate(withDajuAdapter(input));
  } catch (error) {
    translateDajuCompatibilityError(error);
  }
}
