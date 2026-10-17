// Offline-only application wiring for V1.3 RPCs. No production purchase route.
import { createHash } from "node:crypto";
import { normalizeBitrefillInvoice, normalizeBitrefillOrder,
  planBitrefillInvoiceGroups } from "./provider-core.mjs";
import { BitrefillFakeTransport } from "./transport.mjs";
import { BitrefillPurchaseHttpTransport } from "./purchase-http-transport.mjs";
import { prepareBitrefillSingleItem } from "./single-item-purchase.mjs";
import { assertBitrefillRealPurchaseEnabled } from "./prelaunch-policy.mjs";

const DECIMAL_6 = /^(0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/;
const LOGICAL_KEY = /^[A-Za-z0-9:_-]{1,190}$/;
const EXTERNAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const CHILD_STATUS = Object.freeze({
  created: "PENDING", payment_detected: "PENDING", processing: "PROCESSING",
  delivered: "DELIVERED", failed: "FAILED", refunded: "REFUNDED",
});

function requiredDecimal(value, label) {
  if (typeof value !== "string" || !DECIMAL_6.test(value) || Number(value) <= 0) {
    throw new Error(`${label}_INVALID`);
  }
  return value;
}

function requiredResult(result, label) {
  if (result?.error) throw new Error(`${label}_RPC_FAILED: ${result.error.code ?? "UNKNOWN"}`);
  if (!result || result.data === null || result.data === undefined) throw new Error(`${label}_RPC_EMPTY`);
  return result.data;
}

// The caller supplies an already-authenticated service-role client. This file
// never reads a key and exposes no route or non-fake transport.
export function createBitrefillPurchaseRpcAdapter(client) {
  if (!client || typeof client.rpc !== "function" || typeof client.from !== "function") {
    throw new Error("BITREFILL_RPC_CLIENT_REQUIRED");
  }
  const rpc = async (name, args) => requiredResult(await client.rpc(name, args), name);
  const one = async (table, columns, field, value) => {
    const result = await client.from(table).select(columns).eq(field, value).single();
    return requiredResult(result, table);
  };
  const many = async (table, columns, field, value) => {
    const result = await client.from(table).select(columns).eq(field, value);
    const rows = requiredResult(result, table);
    if (!Array.isArray(rows)) throw new Error(`${table}_ROWS_INVALID`);
    return rows;
  };
  return Object.freeze({
    claim: (supplier, key, hash, items) => rpc("internal_supplier_purchase_claim", {
      p_supplier: supplier, p_logical_key: key, p_semantic_hash: hash, p_items: items,
    }),
    transition: (id, expected, next, invoiceId = null) => rpc("internal_supplier_purchase_transition", {
      p_attempt_id: id, p_expected_status: expected, p_next_status: next,
      p_external_invoice_id: invoiceId,
    }),
    recordChild: (itemId, orderId) => rpc("internal_supplier_purchase_record_child", {
      p_attempt_item_id: itemId, p_external_order_id: orderId,
    }),
    recordEvidence: (attemptId, childId, status, resultClass, fingerprint, checkedAt) =>
      rpc("internal_supplier_purchase_record_evidence", {
        p_attempt_id: attemptId, p_external_order_row_id: childId, p_status: status,
        p_result_class: resultClass, p_safe_fingerprint: fingerprint, p_checked_at: checkedAt,
      }),
    recordWebhook: (fingerprint, invoiceId = null, orderId = null) =>
      rpc("internal_supplier_purchase_record_webhook", {
        p_supplier: "bitrefill", p_event_fingerprint: fingerprint,
        p_external_invoice_id: invoiceId, p_external_order_id: orderId,
      }),
    getAttempt: (id) => one("supplier_purchase_attempts", "id,status,external_invoice_id,semantic_request_hash", "id", id),
    getAttemptByInvoice: (id) => one("supplier_purchase_attempts", "id,status,external_invoice_id,semantic_request_hash", "external_invoice_id", id),
    getAttemptItems: (id) => many("supplier_purchase_attempt_items",
      "id,attempt_id,fulfillment_request_id,order_item_id,unit_index,frozen_product_id,frozen_package_id,frozen_currency,frozen_face_value", "attempt_id", id),
    getExternalChild: (id) => one("supplier_external_orders",
      "id,attempt_id,attempt_item_id,supplier,external_order_id,normalized_status", "id", id),
    getAttemptItem: (id) => one("supplier_purchase_attempt_items",
      "id,attempt_id,fulfillment_request_id,order_item_id,unit_index,frozen_product_id,frozen_package_id,frozen_currency,frozen_face_value", "id", id),
    getRoot: (id) => one("supplier_fulfillment_requests",
      "id,order_id,order_item_id,supplier,supplier_product_id,supplier_sku,request_id,attempt_token,status", "id", id),
    recordPrivateOutcome: (context, content) => rpc("internal_supplier_purchase_deliver_child", {
      p_external_order_row_id: context.childRowId,
      p_request_id: context.requestId, p_attempt_token: context.attemptToken,
      p_delivery_content: content,
    }),
  });
}

function makeClaimGroup(group, sourceByOrderItemId) {
  const items = group.allocations.map((allocation) => {
    const source = sourceByOrderItemId.get(allocation.orderItemId);
    if (!source || !source.fulfillmentRequestId) throw new Error("BITREFILL_FROZEN_ROOT_REQUIRED");
    const binding = source.binding;
    const currency = binding?.currency;
    const faceValue = binding?.faceValue;
    if (!/^[A-Z]{3}$/.test(currency ?? "") || typeof faceValue !== "string" ||
        !DECIMAL_6.test(faceValue) || Number(faceValue) <= 0) {
      throw new Error("BITREFILL_FROZEN_CURRENCY_OR_FACE_INVALID");
    }
    return {
      fulfillment_request_id: source.fulfillmentRequestId,
      order_item_id: allocation.orderItemId,
      unit_index: allocation.unitIndex + 1,
      frozen_product_id: allocation.productId,
      frozen_package_id: allocation.packageId,
      frozen_currency: currency,
      frozen_face_value: faceValue,
      quoted_unit_cost: requiredDecimal(source.frozenQuotedCost, "BITREFILL_QUOTED_COST"),
      max_unit_cost: requiredDecimal(source.frozenMaxSupplierCost, "BITREFILL_MAX_COST"),
    };
  });
  const semanticHash = createHash("sha256").update(JSON.stringify({
    request: group.request, items,
    ...(group.allocations.length === 1 && sourceByOrderItemId.get(group.allocations[0].orderItemId)?.semanticContext
      ? { financialContext: sourceByOrderItemId.get(group.allocations[0].orderItemId).semanticContext } : {}),
  })).digest("hex");
  return { items, semanticHash };
}

// A returned SUBMITTING/UNCERTAIN state is intentionally non-retryable. The
// caller must never infer that a failed POST was not sent.
async function runClaimedPurchase({ db, transport, logicalKeyPrefix, items }) {
  if (!db || !["claim", "transition", "getAttempt"].every((name) => typeof db[name] === "function")) {
    throw new Error("BITREFILL_PERSISTENCE_REQUIRED");
  }
  if (!LOGICAL_KEY.test(logicalKeyPrefix ?? "")) throw new Error("BITREFILL_LOGICAL_KEY_INVALID");
  const groups = planBitrefillInvoiceGroups({ items });
  const sourceByOrderItemId = new Map(items.map((item) => [item.orderItemId, item]));
  const results = [];
  for (const [index, group] of groups.entries()) {
    const key = `${logicalKeyPrefix}:${index + 1}`;
    const { items: frozenItems, semanticHash } = makeClaimGroup(group, sourceByOrderItemId);
    const claim = await db.claim("bitrefill", key, semanticHash, frozenItems);
    if (!claim?.attempt_id || !["CLAIMED", "ALREADY_CLAIMED"].includes(claim.result)) {
      throw new Error("BITREFILL_CLAIM_FAILED");
    }
    const attempt = await db.getAttempt(claim.attempt_id);
    if (attempt.semantic_request_hash !== semanticHash) throw new Error("BITREFILL_SEMANTIC_CONFLICT");
    if (attempt.status !== "CLAIMED") {
      results.push({ attemptId: claim.attempt_id, status: attempt.status,
        invoiceId: attempt.external_invoice_id ?? null, submitted: false });
      continue;
    }
    const boundary = await db.transition(claim.attempt_id, "CLAIMED", "SUBMITTING");
    if (boundary?.result !== "TRANSITIONED") {
      const latest = await db.getAttempt(claim.attempt_id);
      results.push({ attemptId: claim.attempt_id, status: latest.status,
        invoiceId: latest.external_invoice_id ?? null, submitted: false });
      continue;
    }
    let invoice;
    try {
      const source = sourceByOrderItemId.get(group.allocations[0]?.orderItemId);
      if (source?.beforeSubmit) await source.beforeSubmit();
      invoice = await transport.createInvoice(group.request);
    } catch (error) {
      await db.transition(claim.attempt_id, "SUBMITTING", "UNCERTAIN");
      results.push({ attemptId: claim.attempt_id, status: "UNCERTAIN", invoiceId: null,
        submitted: error?.submitted !== false, submitPhase: error?.submitted === false
          ? "FAILED_BEFORE_SEND" : "POSSIBLY_SENT" });
      continue;
    }
    if (typeof invoice?.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(invoice.id)) {
      await db.transition(claim.attempt_id, "SUBMITTING", "UNCERTAIN");
      results.push({ attemptId: claim.attempt_id, status: "UNCERTAIN", invoiceId: null,
        submitted: true });
      continue;
    }
    const persisted = await db.transition(claim.attempt_id, "SUBMITTING", "EXTERNAL_CREATED", invoice.id);
    if (persisted?.result !== "TRANSITIONED" && persisted?.result !== "ALREADY_REGISTERED") {
      throw new Error("BITREFILL_EXTERNAL_ID_PERSISTENCE_UNCERTAIN");
    }
    results.push({ attemptId: claim.attempt_id, status: "EXTERNAL_CREATED",
      invoiceId: invoice.id, submitted: true });
  }
  return results;
}

export async function runBitrefillOfflinePurchase(input) {
  if (!(input.transport instanceof BitrefillFakeTransport)) throw new Error("BITREFILL_REAL_PURCHASE_DISABLED");
  return runClaimedPurchase(input);
}

// The only purchase-http path includes the paid-order, frozen identity, fresh
// catalog and trusted-cost gate before a persistence claim or external request.
// No application route or worker invokes it in P1.
export async function runBitrefillSingleItemPurchase({ db, transport, candidate, product,
  productCheckedAt, quote, nowMs, semanticContext, beforeSubmit }) {
  if (!(transport instanceof BitrefillFakeTransport)) assertBitrefillRealPurchaseEnabled();
  if (!(transport instanceof BitrefillFakeTransport) &&
      (!(transport instanceof BitrefillPurchaseHttpTransport) || transport.purchaseEnabled !== true)) {
    throw new Error("BITREFILL_REAL_PURCHASE_DISABLED");
  }
  const { item, logicalKeyPrefix } = prepareBitrefillSingleItem({
    ...candidate, product, productCheckedAt, quote, nowMs,
  });
  if (semanticContext !== undefined) item.semanticContext = structuredClone(semanticContext);
  if (beforeSubmit !== undefined) {
    if (typeof beforeSubmit !== "function") throw new Error("BITREFILL_BEFORE_SUBMIT_INVALID");
    item.beforeSubmit = beforeSubmit;
  }
  const results = await runClaimedPurchase({ db, transport, logicalKeyPrefix, items: [item] });
  if (results.length !== 1) throw new Error("BITREFILL_SINGLE_INVOICE_REQUIRED");
  return results[0];
}

export async function recoverBitrefillOfflineAttempt({ db, transport, attemptId }) {
  if (!(transport instanceof BitrefillFakeTransport)) throw new Error("BITREFILL_REAL_PURCHASE_DISABLED");
  if (!db || typeof db.getAttempt !== "function") throw new Error("BITREFILL_PERSISTENCE_REQUIRED");
  const attempt = await db.getAttempt(attemptId);
  if (!attempt?.external_invoice_id || !["EXTERNAL_CREATED", "RECONCILING"].includes(attempt.status)) {
    return { status: attempt?.status ?? "UNKNOWN", invoiceId: null, requiresManualReview: true };
  }
  const invoice = normalizeBitrefillInvoice(await transport.readInvoice(attempt.external_invoice_id));
  if (invoice.invoice_id !== attempt.external_invoice_id) {
    throw new Error("BITREFILL_RECOVERY_INVOICE_ID_MISMATCH");
  }
  return { status: attempt.status, invoiceId: attempt.external_invoice_id,
    invoiceState: invoice.state, requiresManualReview: invoice.state === "UNKNOWN" };
}

// An external child must carry an explicit persisted attempt-item reference.
// Positional invoice order is never treated as a trustworthy item mapping.
export async function reconcileBitrefillOfflineAttempt({ db, transport, attemptId }) {
  if (!(transport instanceof BitrefillFakeTransport)) throw new Error("BITREFILL_REAL_PURCHASE_DISABLED");
  if (!db || !["getAttempt", "getAttemptItems", "recordChild", "recordEvidence"]
    .every((name) => typeof db[name] === "function")) throw new Error("BITREFILL_PERSISTENCE_REQUIRED");
  const attempt = await db.getAttempt(attemptId);
  if (!attempt?.external_invoice_id || !["EXTERNAL_CREATED", "RECONCILING"].includes(attempt.status)) {
    return { status: attempt?.status ?? "UNKNOWN", deliveryCandidates: [],
      pending: [], failed: [], requiresManualReview: true };
  }
  const raw = await transport.readInvoice(attempt.external_invoice_id);
  const invoice = normalizeBitrefillInvoice(raw);
  if (invoice.invoice_id !== attempt.external_invoice_id || invoice.state === "UNKNOWN") {
    throw new Error("BITREFILL_RECONCILIATION_INVOICE_INVALID");
  }
  const frozenItems = await db.getAttemptItems(attemptId);
  if (!frozenItems.length || frozenItems.length > 20) throw new Error("BITREFILL_FROZEN_UNITS_INVALID");
  const byId = new Map(frozenItems.map((item) => [item.id, item]));
  if (byId.size !== frozenItems.length) throw new Error("BITREFILL_FROZEN_UNITS_DUPLICATE");
  const seen = new Set();
  const deliveryCandidates = [];
  const pending = [];
  const failed = [];
  for (const rawOrder of raw.orders) {
    const reference = rawOrder?.client_reference;
    const item = byId.get(reference);
    const order = normalizeBitrefillOrder(rawOrder);
    const status = CHILD_STATUS[order.status];
    if (!item || seen.has(reference) || !order.order_id || !EXTERNAL_ID.test(order.order_id) || !status) {
      throw new Error("BITREFILL_CHILD_CORRELATION_INVALID");
    }
    seen.add(reference);
    const child = await db.recordChild(item.id, order.order_id);
    const safeFingerprint = createHash("sha256").update(JSON.stringify({
      attemptId, invoiceId: invoice.invoice_id, childId: order.order_id, status,
    })).digest("hex");
    await db.recordEvidence(attemptId, child.external_order_row_id,
      status, "GET_RECONCILIATION", safeFingerprint, new Date().toISOString());
    const safe = { childRowId: child.external_order_row_id, orderItemId: item.order_item_id };
    if (status === "DELIVERED" && order.redemption) deliveryCandidates.push(safe);
    else if (status === "FAILED" || status === "REFUNDED") failed.push(safe);
    else pending.push(safe);
  }
  if (seen.size !== frozenItems.length) {
    return { status: invoice.status, deliveryCandidates, pending, failed,
      requiresManualReview: true, unmappedUnits: frozenItems.length - seen.size };
  }
  return { status: invoice.status, deliveryCandidates, pending, failed,
    requiresManualReview: pending.length > 0 || failed.length > 0 };
}

// Webhooks are wake-ups only. Their payload is deliberately ignored, including
// any injected redemption fields; authoritative GET drives reconciliation.
export async function handleBitrefillOfflineWebhook({ db, transport, event }) {
  if (!(transport instanceof BitrefillFakeTransport)) throw new Error("BITREFILL_REAL_PURCHASE_DISABLED");
  if (!db || !["recordWebhook", "getAttemptByInvoice"].every((name) => typeof db[name] === "function")) {
    throw new Error("BITREFILL_PERSISTENCE_REQUIRED");
  }
  if (typeof event?.eventId !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/.test(event.eventId)
      || typeof event.invoiceId !== "string" || !EXTERNAL_ID.test(event.invoiceId)) {
    throw new Error("BITREFILL_WEBHOOK_ID_INVALID");
  }
  const fingerprint = createHash("sha256").update(JSON.stringify({
    eventId: event.eventId, invoiceId: event.invoiceId,
  })).digest("hex");
  const receipt = await db.recordWebhook(fingerprint, event.invoiceId, null);
  if (receipt.result !== "RECEIVED") {
    return { receipt: receipt.result, reconciled: false };
  }
  const attempt = await db.getAttemptByInvoice(event.invoiceId);
  const result = await reconcileBitrefillOfflineAttempt({ db, transport, attemptId: attempt.id });
  return { receipt: receipt.result, reconciled: true, result };
}

// The repository's existing supplier outcome RPC owns the delivery transaction.
// This function never writes a supplier evidence/receipt row containing a secret.
export async function deliverBitrefillOfflineChild({ db, transport, childRowId }) {
  if (!(transport instanceof BitrefillFakeTransport)) throw new Error("BITREFILL_REAL_PURCHASE_DISABLED");
  if (!db || !["getExternalChild", "getAttemptItem", "getRoot", "recordPrivateOutcome"]
    .every((name) => typeof db[name] === "function")) throw new Error("BITREFILL_PERSISTENCE_REQUIRED");
  const child = await db.getExternalChild(childRowId);
  if (child.supplier !== "bitrefill" || child.normalized_status !== "DELIVERED") {
    throw new Error("BITREFILL_CHILD_NOT_DELIVERABLE");
  }
  const item = await db.getAttemptItem(child.attempt_item_id);
  const root = await db.getRoot(item.fulfillment_request_id);
  if (item.attempt_id !== child.attempt_id || root.order_item_id !== item.order_item_id ||
      root.supplier !== "bitrefill" || !root.attempt_token ||
      !["PURCHASING", "FULFILLED"].includes(root.status)) {
    throw new Error("BITREFILL_PRIVATE_DELIVERY_IDENTITY_MISMATCH");
  }
  const order = normalizeBitrefillOrder(await transport.readOrder(child.external_order_id));
  if (order.order_id !== child.external_order_id || order.state !== "SUCCEEDED" ||
      !order.redemption?.payload) throw new Error("BITREFILL_AUTHORITATIVE_DELIVERY_MISSING");
  const context = { childRowId, orderId: root.order_id, orderItemId: item.order_item_id,
    requestId: root.request_id, attemptToken: root.attempt_token,
    externalOrderId: child.external_order_id };
  const outcome = await db.recordPrivateOutcome(context, JSON.stringify(order.redemption.payload));
  if (outcome?.ok !== true || !outcome.delivery_id) throw new Error("BITREFILL_PRIVATE_DELIVERY_FAILED");
  return { delivered: true, idempotent: outcome.idempotent === true,
    childRowId, orderItemId: item.order_item_id };
}
