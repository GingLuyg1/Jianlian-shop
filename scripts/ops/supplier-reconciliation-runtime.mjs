import crypto from "node:crypto";

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
    .select("id,supplier,status,external_invoice_id")
    .in("status", [...attemptStates])
    .limit(100);
  if (error) throw new Error("SUPPLIER_RECONCILIATION_READ_FAILED");
  let checked = 0;
  for (const attempt of attempts ?? []) {
    if (!attemptStates.includes(attempt.status) || attempt.supplier !== "daju") continue;
    const orderCode = attempt.external_invoice_id;
    if (!orderCode) continue;
    let status = "UNKNOWN";
    let resultClass = "QUERY_FAILED";
    try {
      const order = await getOrder(orderCode);
      status = normalizeSupplierStatus(order?.status);
      resultClass = status === "DELIVERED" ? "PROVIDER_SUCCESS" : "PROVIDER_STATE";
    } catch { /* Do not persist provider errors or raw response contents. */ }
    const fingerprint = crypto.createHash("sha256")
      .update(`${attempt.id}:${orderCode}:${status}`).digest("hex");
    const evidence = await service.rpc("internal_supplier_purchase_record_evidence", {
      p_attempt_id: attempt.id,
      p_external_order_row_id: null,
      p_status: status,
      p_result_class: resultClass,
      p_safe_fingerprint: fingerprint,
      p_checked_at: new Date().toISOString(),
    });
    if (evidence.error) throw new Error("SUPPLIER_RECONCILIATION_EVIDENCE_WRITE_FAILED");
    checked++;
  }
  return checked;
}
