import { classifyDajuPurchaseFailure } from "./protocol.mjs";

export function decideDajuOrderResult(order) {
  if (!order || typeof order !== "object") return { kind: "uncertain", state: "UNCERTAIN", code: "DAJU_RESPONSE_INVALID" };
  if (Array.isArray(order.delivered) && order.delivered.length > 0) {
    return { kind: "fulfilled", state: "FULFILLED", delivered: order.delivered, orderCode: order.orderCode };
  }
  if (typeof order.orderCode === "string" && order.orderCode) {
    return { kind: "query_order", state: "PURCHASING", orderCode: order.orderCode };
  }
  return { kind: "uncertain", state: "UNCERTAIN", code: "DAJU_DELIVERY_PENDING_WITHOUT_ORDER_CODE" };
}

export function decideDajuError(error) {
  const code = typeof error?.code === "string" ? error.code : "UPSTREAM_UNAVAILABLE";
  if (error?.kind === "timeout" || error?.kind === "transport") {
    return { kind: "uncertain", state: "UNCERTAIN", retryable: false, code };
  }
  const classified = classifyDajuPurchaseFailure(code);
  return {
    kind: classified.state === "FAILED" ? "failed" : classified.state === "PENDING" ? "retry_later" : "uncertain",
    ...classified,
    code,
  };
}

export function joinDajuDeliveredSecrets(delivered) {
  if (!Array.isArray(delivered) || delivered.length === 0) return null;
  if (!delivered.every((entry) => typeof entry === "string" && entry.trim() && entry.trim().length <= 20_000)) return null;
  return delivered.map((entry) => entry.trim()).join("\n");
}
