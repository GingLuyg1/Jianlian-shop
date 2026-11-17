import { reconcileDajuAttempt } from "../../lib/providers/daju/purchase-v2.mjs";
import { createDajuV2Store } from "../../lib/providers/daju/purchase-v2-store.mjs";

const attemptStates = Object.freeze(["EXTERNAL_CREATED", "RECONCILING"]);
const statusMap = Object.freeze({
  DELIVERED: "DELIVERED", SUCCEEDED: "DELIVERED", COMPLETED: "DELIVERED",
  PENDING: "PENDING", CREATED: "PENDING", WAITING: "PENDING",
  PROCESSING: "PROCESSING", IN_PROGRESS: "PROCESSING",
  FAILED: "FAILED", REJECTED: "FAILED", CANCELLED: "FAILED", CANCELED: "FAILED",
  REFUNDED: "REFUNDED",
});

export function normalizeSupplierStatus(value) {
  const key = typeof value === "string" ? value.trim().toUpperCase() : "";
  return Object.hasOwn(statusMap, key) ? statusMap[key] : "UNKNOWN";
}

export async function runSupplierReconciliation({ service, getOrder }) {
  const { data: attempts, error } = await service
    .from("supplier_purchase_attempts")
    .select("id,supplier,status,external_invoice_id,logical_request_key")
    .in("status", [...attemptStates])
    .limit(100);
  if (error) throw new Error("SUPPLIER_RECONCILIATION_READ_FAILED");
  let checked = 0;
  for (const attempt of attempts ?? []) {
    if (!attemptStates.includes(attempt.status) || attempt.supplier !== "daju") continue;
    const orderCode = attempt.external_invoice_id;
    if (!orderCode) continue;
    await reconcileDajuAttempt({ db: createDajuV2Store(service), client: {getOrder}, attempt });
    checked++;

  }
  return checked;
}
