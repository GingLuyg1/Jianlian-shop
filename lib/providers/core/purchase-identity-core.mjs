import { createHash } from "node:crypto";

function requiredText(value, max, pattern) {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > max
      || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value)
      || (pattern && !pattern.test(value))) throw new Error("SUPPLIER_PURCHASE_IDENTITY_INVALID");
  return value;
}

function positiveDecimal(value) {
  const text = requiredText(value, 30, /^(0|[1-9]\d{0,17})(?:\.\d{1,8})?$/);
  if (!/[1-9]/.test(text)) throw new Error("SUPPLIER_PURCHASE_COST_INVALID");
  return text;
}

// Hash only frozen, non-secret identity fields. The caller must persist the
// resulting hash transactionally before any future external submit boundary.
export function buildSupplierPurchaseIdentity(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("SUPPLIER_PURCHASE_IDENTITY_INVALID");
  const identity = {
    version: 1,
    provider: requiredText(input.provider, 80, /^[a-z][a-z0-9_-]*$/),
    orderItemId: requiredText(input.orderItemId, 100, /^[A-Za-z0-9:-]+$/),
    requestId: requiredText(input.requestId, 200, /^[A-Za-z0-9:_-]+$/),
    attemptId: requiredText(input.attemptId, 36, /^[0-9a-fA-F-]{36}$/),
    productId: requiredText(input.productId, 200, /^[A-Za-z0-9_-]+$/),
    packageId: requiredText(input.packageId, 300),
    quantity: input.quantity,
    amount: positiveDecimal(input.amount),
    currency: requiredText(input.currency, 3, /^[A-Z]{3}$/),
  };
  if (!Number.isSafeInteger(identity.quantity) || identity.quantity < 1 || identity.quantity > 20) {
    throw new Error("SUPPLIER_PURCHASE_QUANTITY_INVALID");
  }
  const semanticHash = createHash("sha256").update(JSON.stringify(identity), "utf8").digest("hex");
  return { identity, semanticHash };
}

export function classifySupplierSubmitBoundary(input) {
  if (input?.submitMayHaveLeft === true) {
    return { state: "UNCERTAIN", retryPurchase: false, next: input.externalInvoiceId ? "QUERY_ONLY" : "MANUAL_REVIEW" };
  }
  if (input?.submitMayHaveLeft === false && input?.durableState === "BEFORE_SUBMIT") {
    return { state: "BEFORE_SUBMIT", retryPurchase: true, next: "REVALIDATE_FROZEN_REQUEST" };
  }
  return { state: "UNKNOWN", retryPurchase: false, next: "MANUAL_REVIEW" };
}
