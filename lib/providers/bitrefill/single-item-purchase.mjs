// P1 preparation and reconciliation only. No route, worker, credential reader,
// scheduler or production activation is provided by this module.
import { createHash } from "node:crypto";
import { buildBitrefillInvoiceRequest, normalizeBitrefillInvoice,
  normalizeBitrefillOrder, normalizeBitrefillProduct } from "./provider-core.mjs";
import { parseBitrefillProduct } from "./protocol.mjs";

const DECIMAL = /^(0|[1-9][0-9]{0,11})(?:\.([0-9]{1,6}))?$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const AUTOMATIC = new Set(["automatic", "auto", "card", "account", "auto_delivery"]);
const TERMINAL_ORDER = new Set(["cancelled", "expired", "refunded", "failed"]);
const CHILD_STATUS = Object.freeze({ created: "PENDING", payment_detected: "PENDING",
  processing: "PROCESSING", delivered: "DELIVERED", failed: "FAILED", refunded: "REFUNDED" });

function decimal(value, code) {
  if (typeof value !== "string" || !DECIMAL.test(value)) throw new Error(code);
  const [whole, fractional = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fractional.padEnd(6, "0") || "0");
}

function sameFace(value, frozen) {
  const text = typeof value === "string" ? value : Number.isSafeInteger(value) ? String(value) : null;
  return text !== null && decimal(text, "BITREFILL_CHILD_FACE_INVALID") === decimal(frozen, "BITREFILL_FROZEN_FACE_INVALID");
}

function fresh(instant, nowMs) {
  const at = Date.parse(instant);
  return Number.isFinite(at) && Number.isFinite(nowMs) && at <= nowMs && nowMs - at <= 5 * 60_000;
}

function snapshotBinding(item) {
  const snapshot = item?.product_snapshot;
  const binding = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? snapshot.supplier_binding : null;
  if (!binding || typeof binding !== "object" || Array.isArray(binding) ||
      binding.fulfillment_source !== "supplier" || binding.supplier !== "bitrefill") {
    throw new Error("BITREFILL_FROZEN_BINDING_REQUIRED");
  }
  return binding;
}

// The quote is deliberately separate from the gift-card face value and catalog
// package price. Its authenticated cost currency and provenance must be supplied
// by a future approved server-side pricing source; nothing here invents FX.
export function prepareBitrefillSingleItem({ order, orderItem, root, product, productCheckedAt,
  quote, nowMs = Date.now() }) {
  if (!order?.id || order.payment_status !== "paid" || TERMINAL_ORDER.has(order.status) ||
      !order.status || orderItem?.order_id !== order.id) {
    throw new Error("BITREFILL_ORDER_NOT_PAID_OR_ELIGIBLE");
  }
  if (!orderItem?.id || orderItem.quantity !== 1 || !AUTOMATIC.has(orderItem.delivery_type) ||
      orderItem.delivery_status === "delivered") {
    throw new Error("BITREFILL_SINGLE_ITEM_NOT_ELIGIBLE");
  }
  const frozen = snapshotBinding(orderItem);
  if (!root?.id || root.order_id !== order.id || root.order_item_id !== orderItem.id ||
      root.supplier !== "bitrefill" || !["PENDING", "PURCHASING"].includes(root.status) ||
      root.supplier_product_id !== frozen.supplier_product_id ||
      root.supplier_sku !== frozen.supplier_sku || !root.attempt_token) {
    throw new Error("BITREFILL_FROZEN_ROOT_MISMATCH");
  }
  if (typeof frozen.supplier_product_id !== "string" ||
      typeof frozen.supplier_sku !== "string" || !frozen.supplier_sku ||
      !/^[A-Z]{3}$/.test(frozen.supplier_currency ?? "") ||
      !/^[A-Z]{3}$/.test(order.currency ?? "")) {
    throw new Error("BITREFILL_FROZEN_PRODUCT_OR_CURRENCY_INVALID");
  }
  const face = decimal(frozen.supplier_face_value, "BITREFILL_FROZEN_FACE_INVALID");
  const cap = decimal(frozen.supplier_max_unit_cost, "BITREFILL_FROZEN_COST_CAP_INVALID");
  const minProfit = decimal(frozen.supplier_min_unit_profit, "BITREFILL_FROZEN_PROFIT_INVALID");
  const sale = decimal(String(orderItem.unit_price), "BITREFILL_SALE_PRICE_INVALID");
  if (face <= 0n || cap <= 0n || minProfit <= 0n || sale <= 0n) {
    throw new Error("BITREFILL_FROZEN_FINANCIALS_INVALID");
  }
  if (!fresh(productCheckedAt, nowMs) || product?.provider !== "bitrefill" ||
      product.external_product_id !== frozen.supplier_product_id || product.availability !== "available" ||
      product.currency !== frozen.supplier_currency) {
    throw new Error("BITREFILL_FRESH_PRODUCT_REQUIRED");
  }
  const selected = product.fixed_packages?.filter((entry) => entry.package_id === frozen.supplier_sku);
  if (!Array.isArray(selected) || selected.length !== 1 ||
      selected[0].currency !== frozen.supplier_currency ||
      !sameFace(selected[0].face_value, frozen.supplier_face_value)) {
    throw new Error("BITREFILL_PACKAGE_DRIFT");
  }
  if (quote?.source !== "authenticated_supplier_cost" ||
      quote.productId !== frozen.supplier_product_id || quote.packageId !== frozen.supplier_sku ||
      quote.currency !== frozen.supplier_currency || !fresh(quote.checkedAt, nowMs)) {
    throw new Error("BITREFILL_TRUSTED_COST_REQUIRED");
  }
  const cost = decimal(quote.amount, "BITREFILL_TRUSTED_COST_REQUIRED");
  if (cost <= 0n || cost > cap || order.currency !== quote.currency || cost + minProfit > sale) {
    throw new Error("BITREFILL_COST_OR_PROFIT_GATE_FAILED");
  }
  const item = {
    orderItemId: orderItem.id, fulfillmentRequestId: root.id, quantity: 1,
    binding: { supplier: "bitrefill", productId: frozen.supplier_product_id,
      sku: frozen.supplier_sku, currency: frozen.supplier_currency,
      faceValue: frozen.supplier_face_value },
    product, expectedCost: quote.amount, frozenQuotedCost: quote.amount,
    frozenMaxSupplierCost: frozen.supplier_max_unit_cost,
  };
  buildBitrefillInvoiceRequest({ items: [item] });
  return Object.freeze({ item, logicalKeyPrefix: `bitrefill:${orderItem.id}` });
}

// This loader deliberately reads the paid order and frozen order-item snapshot
// from the server-side client, never accepts a browser payment assertion.
export async function loadBitrefillSingleItemCandidate(service, orderId, orderItemId) {
  if (!ID.test(orderId ?? "") || !ID.test(orderItemId ?? "") || !service?.from) {
    throw new Error("BITREFILL_ORDER_ID_INVALID");
  }
  const one = async (table, columns, field, value) => {
    const result = await service.from(table).select(columns).eq(field, value).single();
    if (result.error || !result.data) throw new Error("BITREFILL_ORDER_READ_FAILED");
    return result.data;
  };
  const order = await one("orders", "id,status,payment_status,currency", "id", orderId);
  const orderItem = await one("order_items",
    "id,order_id,product_id,sku_id,quantity,delivery_type,delivery_status,unit_price,product_snapshot", "id", orderItemId);
  const root = await one("supplier_fulfillment_requests",
    "id,order_id,order_item_id,supplier,supplier_product_id,supplier_sku,status,attempt_token", "order_item_id", orderItemId);
  return { order, orderItem, root };
}

export async function loadFreshBitrefillProduct(transport, productId, now = () => new Date()) {
  if (!transport?.readProduct || typeof productId !== "string") {
    throw new Error("BITREFILL_PRODUCT_READER_REQUIRED");
  }
  const response = await transport.readProduct(productId);
  const parsed = parseBitrefillProduct(response?.product ?? response);
  if (!parsed || parsed.id !== productId) throw new Error("BITREFILL_FRESH_PRODUCT_INVALID");
  return { product: normalizeBitrefillProduct(parsed), productCheckedAt: now().toISOString() };
}

function rawInvoice(value) { return value?.data && typeof value.data === "object" ? value.data : value; }

function verifiedSingleChild(invoiceValue, orderValue, attempt, item) {
  const raw = rawInvoice(invoiceValue);
  const invoice = normalizeBitrefillInvoice(raw);
  if (invoice.invoice_id !== attempt.external_invoice_id || invoice.state === "UNKNOWN" ||
      !Array.isArray(raw?.orders) || raw.orders.length !== 1 ||
      !ID.test(raw.orders[0]?.id ?? "")) throw new Error("BITREFILL_UNKNOWN_CHILD_MANUAL_REVIEW");
  const order = normalizeBitrefillOrder(orderValue);
  const rawOrder = rawInvoice(orderValue);
  if (order.order_id !== raw.orders[0].id || order.status !== raw.orders[0].status ||
      !CHILD_STATUS[order.status] || rawOrder?.product?.id !== item.frozen_product_id ||
      !sameFace(rawOrder.product.value, item.frozen_face_value) ||
      (rawOrder.product.package_id !== undefined && rawOrder.product.package_id !== item.frozen_package_id)) {
    throw new Error("BITREFILL_UNKNOWN_CHILD_MANUAL_REVIEW");
  }
  return { invoice, order, status: CHILD_STATUS[order.status] };
}

export async function reconcileBitrefillSingleItem({ db, transport, attemptId }) {
  if (!db || !["getAttempt", "getAttemptItems", "recordChild", "recordEvidence"].every((name) => typeof db[name] === "function") ||
      !transport?.readInvoice || !transport?.readOrder) throw new Error("BITREFILL_RECONCILIATION_DEPENDENCY_INVALID");
  const attempt = await db.getAttempt(attemptId);
  if (!attempt?.external_invoice_id || !["EXTERNAL_CREATED", "RECONCILING"].includes(attempt.status)) {
    return { requiresManualReview: true, deliveryCandidates: [], status: attempt?.status ?? "UNKNOWN" };
  }
  const items = await db.getAttemptItems(attemptId);
  if (items.length !== 1 || items[0].unit_index !== 1) {
    throw new Error("BITREFILL_SINGLE_ITEM_MAPPING_REQUIRED");
  }
  const invoice = await transport.readInvoice(attempt.external_invoice_id);
  const raw = rawInvoice(invoice);
  if (!Array.isArray(raw?.orders) || raw.orders.length !== 1 || !ID.test(raw.orders[0]?.id ?? "")) {
    throw new Error("BITREFILL_UNKNOWN_CHILD_MANUAL_REVIEW");
  }
  const order = await transport.readOrder(raw.orders[0].id);
  const verified = verifiedSingleChild(invoice, order, attempt, items[0]);
  const child = await db.recordChild(items[0].id, verified.order.order_id);
  const fingerprint = createHash("sha256").update(JSON.stringify({ attemptId,
    invoiceId: attempt.external_invoice_id, childId: verified.order.order_id,
    status: verified.status })).digest("hex");
  await db.recordEvidence(attemptId, child.external_order_row_id, verified.status,
    "GET_RECONCILIATION", fingerprint, new Date().toISOString());
  const deliverable = verified.invoice.status === "complete" && verified.status === "DELIVERED"
    && Boolean(verified.order.redemption);
  return { status: verified.invoice.status, childStatus: verified.status, requiresManualReview: !deliverable,
    deliveryCandidates: deliverable ? [{ childRowId: child.external_order_row_id,
      orderItemId: items[0].order_item_id }] : [] };
}

// Only this existing private-delivery RPC may write a card secret. It rechecks
// the sole child by authoritative GET immediately before the transaction.
export async function deliverBitrefillSingleItem({ db, transport, childRowId }) {
  if (!db || !["getExternalChild", "getAttemptItem", "getAttempt", "getRoot", "recordPrivateOutcome"]
    .every((name) => typeof db[name] === "function") || !transport?.readInvoice || !transport?.readOrder) {
    throw new Error("BITREFILL_DELIVERY_DEPENDENCY_INVALID");
  }
  const child = await db.getExternalChild(childRowId);
  const item = await db.getAttemptItem(child.attempt_item_id);
  const attempt = await db.getAttempt(child.attempt_id);
  const root = await db.getRoot(item.fulfillment_request_id);
  if (child.supplier !== "bitrefill" || child.normalized_status !== "DELIVERED" ||
      item.attempt_id !== child.attempt_id || item.unit_index !== 1 ||
      root.order_item_id !== item.order_item_id || root.supplier !== "bitrefill" ||
      !root.attempt_token || !["PURCHASING", "FULFILLED"].includes(root.status) ||
      !attempt.external_invoice_id) throw new Error("BITREFILL_PRIVATE_DELIVERY_IDENTITY_MISMATCH");
  const invoice = await transport.readInvoice(attempt.external_invoice_id);
  const order = await transport.readOrder(child.external_order_id);
  const verified = verifiedSingleChild(invoice, order, attempt, item);
  if (verified.invoice.status !== "complete" || verified.order.order_id !== child.external_order_id || verified.status !== "DELIVERED" ||
      !verified.order.redemption?.payload) throw new Error("BITREFILL_AUTHORITATIVE_DELIVERY_MISSING");
  const outcome = await db.recordPrivateOutcome({ childRowId, requestId: root.request_id,
    attemptToken: root.attempt_token }, JSON.stringify(verified.order.redemption.payload));
  if (outcome?.ok !== true || !outcome.delivery_id) throw new Error("BITREFILL_PRIVATE_DELIVERY_FAILED");
  return { delivered: true, idempotent: outcome.idempotent === true,
    childRowId, orderItemId: item.order_item_id };
}
