// Offline-only application wiring for V1.3 RPCs. No production purchase route.
import { createHash } from "node:crypto";
import { normalizeBitrefillInvoice, planBitrefillInvoiceGroups } from "./provider-core.mjs";
import { BitrefillFakeTransport } from "./transport.mjs";

const DECIMAL_6 = /^(0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/;
const LOGICAL_KEY = /^[A-Za-z0-9:_-]{1,190}$/;

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
  })).digest("hex");
  return { items, semanticHash };
}

// A returned SUBMITTING/UNCERTAIN state is intentionally non-retryable. The
// caller must never infer that a failed POST was not sent.
export async function runBitrefillOfflinePurchase({ db, transport, logicalKeyPrefix, items }) {
  if (!(transport instanceof BitrefillFakeTransport)) throw new Error("BITREFILL_REAL_PURCHASE_DISABLED");
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
      invoice = await transport.createInvoice(group.request);
    } catch {
      await db.transition(claim.attempt_id, "SUBMITTING", "UNCERTAIN");
      results.push({ attemptId: claim.attempt_id, status: "UNCERTAIN", invoiceId: null,
        submitted: true });
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
