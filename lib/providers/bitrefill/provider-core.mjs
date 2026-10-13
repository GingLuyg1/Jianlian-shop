import { isPlainRecord, mapBitrefillAvailability } from "./protocol.mjs";
import { BitrefillTransportError } from "./transport.mjs";

export const BITREFILL_CAPABILITIES = Object.freeze({
  catalog: true,
  availability: true,
  purchase: false,
  orderLookup: "fixture_only",
  reconciliation: "fixture_only",
  variableAmountPurchase: false,
});

const INVOICE_STATUSES = new Set([
  "unpaid", "payment_detected", "payment_confirmed", "pending",
  "complete", "blocked", "denied", "payment_error",
]);
const ORDER_STATUSES = new Set(["created", "payment_detected", "processing", "delivered", "failed", "refunded"]);
const FINAL_FAILED_INVOICE = new Set(["blocked", "denied", "payment_error"]);
const PENDING_INVOICE = new Set(["unpaid", "payment_detected", "payment_confirmed", "pending"]);
const PENDING_ORDER = new Set(["created", "payment_detected", "processing"]);
const MAX_INVOICE_ITEMS = 20;

function requiredText(value, code, max = 300) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > max) throw new Error(code);
  return text;
}

function positiveQuantity(value) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_INVOICE_ITEMS) {
    throw new Error("BITREFILL_QUANTITY_INVALID");
  }
  return value;
}

function decimalParts(value) {
  const text = String(value ?? "").trim();
  const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(text);
  if (!match) throw new Error("BITREFILL_COST_INVALID");
  const fraction = (match[2] ?? "").padEnd(8, "0");
  return (BigInt(match[1]) * 100_000_000n) + BigInt(fraction || "0");
}

export function assertBitrefillCostWithinLimit(expectedCost, frozenMaxSupplierCost) {
  if (decimalParts(expectedCost) > decimalParts(frozenMaxSupplierCost)) {
    throw new Error("PURCHASE_COST_LIMIT");
  }
  return true;
}

export function normalizeBitrefillProduct(product) {
  if (!isPlainRecord(product)) throw new Error("BITREFILL_PRODUCT_INVALID");
  const externalProductId = requiredText(product.id, "BITREFILL_PRODUCT_INVALID", 200);
  const availability = mapBitrefillAvailability(product);
  const fixedPackages = (Array.isArray(product.packages) ? product.packages : []).map((entry) => ({
    package_id: requiredText(entry?.packageId, "BITREFILL_PACKAGE_INVALID", 300),
    face_value: entry.value,
    currency: requiredText(product.currency, "BITREFILL_PRODUCT_INVALID", 12),
    price: entry.price ?? null,
  }));
  if (new Set(fixedPackages.map((entry) => entry.package_id)).size !== fixedPackages.length) {
    throw new Error("BITREFILL_PACKAGE_DUPLICATE");
  }
  return {
    provider: "bitrefill",
    external_product_id: externalProductId,
    name: requiredText(product.name, "BITREFILL_PRODUCT_INVALID"),
    country: requiredText(product.country, "BITREFILL_PRODUCT_INVALID", 2),
    currency: requiredText(product.currency, "BITREFILL_PRODUCT_INVALID", 12),
    availability: availability.available ? "available" : "unavailable",
    supplier_quantity: null,
    supplier_quantity_known: false,
    product_type: requiredText(product.type ?? "unknown", "BITREFILL_PRODUCT_INVALID", 80),
    fixed_packages: fixedPackages,
    variable_range: product.range ? {
      min: product.range.min,
      max: product.range.max,
      step: product.range.step,
      price_rate: product.range.priceRate ?? null,
    } : null,
  };
}

export function buildBitrefillSnapshot(product, packageId, checkedAt, errorCode = null) {
  const normalized = normalizeBitrefillProduct(product);
  const selectedPackage = packageId === null || packageId === undefined
    ? null
    : normalized.fixed_packages.find((entry) => entry.package_id === packageId);
  if (packageId !== null && packageId !== undefined && !selectedPackage) throw new Error("BITREFILL_PACKAGE_NOT_FOUND");
  const timestamp = requiredText(checkedAt, "BITREFILL_SNAPSHOT_TIME_INVALID", 40);
  return {
    provider: "bitrefill",
    product_id: normalized.external_product_id,
    package_id: selectedPackage?.package_id ?? null,
    available: errorCode ? null : normalized.availability === "available",
    quantity: null,
    supplier_quantity_known: false,
    checked_at: timestamp,
    error_state: errorCode,
    freshness: {
      supplier_stock_synced_at: errorCode ? null : timestamp,
      supplier_stock_last_success_at: errorCode ? null : timestamp,
      supplier_stock_sync_attempted_at: timestamp,
      supplier_stock_stale: Boolean(errorCode),
      supplier_stock_sync_status: errorCode ? "error" : "synced",
      supplier_stock_sync_error: errorCode,
    },
  };
}

function validateInvoiceItem(item) {
  if (!isPlainRecord(item) || !isPlainRecord(item.binding) || !isPlainRecord(item.product)) {
    throw new Error("BITREFILL_INVOICE_ITEM_INVALID");
  }
  if (item.binding.supplier !== "bitrefill") throw new Error("BITREFILL_FROZEN_BINDING_INVALID");
  const productId = requiredText(item.binding.productId ?? item.binding.supplier_product_id, "BITREFILL_FROZEN_BINDING_INVALID", 200);
  const packageId = requiredText(item.binding.sku ?? item.binding.supplier_sku, "BITREFILL_FROZEN_BINDING_INVALID", 300);
  if (item.product.provider !== "bitrefill" || item.product.external_product_id !== productId) {
    throw new Error("BITREFILL_FROZEN_BINDING_MISMATCH");
  }
  if (item.product.availability !== "available") throw new Error("OUT_OF_STOCK");
  const fixedPackage = item.product.fixed_packages?.find((entry) => entry.package_id === packageId);
  if (!fixedPackage) throw new Error("BITREFILL_PACKAGE_NOT_FOUND");
  const quantity = positiveQuantity(item.quantity);
  assertBitrefillCostWithinLimit(item.expectedCost, item.frozenMaxSupplierCost);
  return { product_id: productId, package_id: packageId, quantity };
}

export function buildBitrefillInvoiceRequest(input) {
  if (!isPlainRecord(input) || !Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("BITREFILL_INVOICE_ITEMS_REQUIRED");
  }
  const products = input.items.map(validateInvoiceItem);
  const itemCount = products.reduce((total, item) => total + item.quantity, 0);
  if (itemCount > MAX_INVOICE_ITEMS) throw new Error("BITREFILL_INVOICE_ITEM_LIMIT");
  return { products };
}

export function planBitrefillInvoiceSplits(input) {
  if (!isPlainRecord(input) || !Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("BITREFILL_INVOICE_ITEMS_REQUIRED");
  }
  const validated = input.items.map((item) => ({ original: item, request: validateInvoiceItem(item) }));
  const plans = [];
  let current = [];
  let count = 0;
  for (const item of validated) {
    let remaining = item.request.quantity;
    while (remaining > 0) {
      const take = Math.min(remaining, MAX_INVOICE_ITEMS - count);
      current.push({ ...item.original, quantity: take });
      count += take;
      remaining -= take;
      if (count === MAX_INVOICE_ITEMS) {
        plans.push(buildBitrefillInvoiceRequest({ items: current }));
        current = [];
        count = 0;
      }
    }
  }
  if (current.length) plans.push(buildBitrefillInvoiceRequest({ items: current }));
  return plans;
}

function unwrap(value) {
  return isPlainRecord(value?.data) ? value.data : value;
}

export function normalizeBitrefillOrder(value) {
  const order = unwrap(value);
  if (!isPlainRecord(order)) return { state: "UNKNOWN", order_id: null, status: "unknown", redemption: null };
  const orderId = typeof order.id === "string" && order.id.trim() ? order.id.trim() : null;
  const status = typeof order.status === "string" ? order.status : "unknown";
  if (!orderId || !ORDER_STATUSES.has(status)) return { state: "UNKNOWN", order_id: orderId, status, redemption: null };
  const state = status === "delivered" ? "SUCCEEDED" : PENDING_ORDER.has(status) ? "PENDING" : "FAILED";
  return { state, order_id: orderId, status, redemption: status === "delivered" ? normalizeBitrefillRedemption(order.redemption_info) : null };
}

export function normalizeBitrefillInvoice(value) {
  const invoice = unwrap(value);
  if (!isPlainRecord(invoice)) return { state: "UNKNOWN", invoice_id: null, status: "unknown", orders: [] };
  const invoiceId = typeof invoice.id === "string" && invoice.id.trim() ? invoice.id.trim() : null;
  const status = typeof invoice.status === "string" ? invoice.status : "unknown";
  const orders = Array.isArray(invoice.orders) && invoice.orders.length <= MAX_INVOICE_ITEMS
    ? invoice.orders.map(normalizeBitrefillOrder)
    : [];
  if (!invoiceId || !INVOICE_STATUSES.has(status) || !Array.isArray(invoice.orders) || invoice.orders.length > MAX_INVOICE_ITEMS) {
    return { state: "UNKNOWN", invoice_id: invoiceId, status, orders: [] };
  }
  const state = PENDING_INVOICE.has(status) ? "PENDING" : FINAL_FAILED_INVOICE.has(status) ? "FAILED" : "SUCCEEDED";
  return { state, invoice_id: invoiceId, status, orders };
}

export function normalizeBitrefillRedemption(value) {
  if (!isPlainRecord(value)) return null;
  const payload = {};
  for (const [source, target] of [["code", "code"], ["pin", "pin"], ["link", "url"], ["url", "url"], ["instructions", "instructions"]]) {
    if (typeof value[source] === "string" && value[source].trim() && value[source].length <= 10_000 && payload[target] === undefined) {
      payload[target] = value[source].trim();
    }
  }
  return Object.keys(payload).length ? { storage: "digital_delivery_secrets", payload } : null;
}

export function reconcileBitrefillInvoice(value) {
  const invoice = normalizeBitrefillInvoice(value);
  if (invoice.state === "UNKNOWN") return { state: "RECONCILIATION_REQUIRED", invoice, deliveryCandidates: [], failedOrderIds: [], pendingOrderIds: [] };
  const deliveryCandidates = invoice.orders.filter((order) => order.state === "SUCCEEDED" && order.redemption);
  const failedOrderIds = invoice.orders.filter((order) => order.state === "FAILED").map((order) => order.order_id);
  const pendingOrderIds = invoice.orders.filter((order) => order.state === "PENDING" || order.state === "UNKNOWN" || (order.state === "SUCCEEDED" && !order.redemption)).map((order) => order.order_id);
  let state = "RECONCILIATION_REQUIRED";
  if (invoice.state === "PENDING") state = "PENDING";
  else if (invoice.state === "FAILED") state = "FAILED";
  else if (invoice.status === "complete" && failedOrderIds.length === 0 && pendingOrderIds.length === 0 && deliveryCandidates.length === invoice.orders.length && invoice.orders.length > 0) state = "SUCCEEDED";
  return { state, invoice, deliveryCandidates, failedOrderIds, pendingOrderIds };
}

export function classifyBitrefillSubmitFailure(error) {
  if (error?.submitted === true || error?.code === "POST_SUBMIT_TIMEOUT") {
    return { state: "UNCERTAIN", retryPurchase: false, next: "RECONCILIATION_REQUIRED", code: "POST_SUBMIT_TIMEOUT" };
  }
  return { state: "FAILED", retryPurchase: false, next: "NONE", code: "PURCHASE_DISABLED" };
}

export function buildBitrefillLogMetadata(input) {
  if (!isPlainRecord(input)) throw new Error("BITREFILL_LOG_METADATA_INVALID");
  const metadata = { provider: "bitrefill" };
  for (const key of ["operation", "productId", "invoiceId", "orderId", "status", "errorClass"]) {
    if (input[key] !== undefined && input[key] !== null) metadata[key] = requiredText(input[key], "BITREFILL_LOG_METADATA_INVALID", 200);
  }
  if (input.latencyMs !== undefined) {
    if (!Number.isSafeInteger(input.latencyMs) || input.latencyMs < 0 || input.latencyMs > 3_600_000) throw new Error("BITREFILL_LOG_METADATA_INVALID");
    metadata.latencyMs = input.latencyMs;
  }
  return metadata;
}

export class BitrefillDeliveryDeduplicator {
  constructor() { this.claimedOrderIds = new Set(); }
  claim(orderId) {
    const normalized = requiredText(orderId, "BITREFILL_ORDER_ID_INVALID", 200);
    if (this.claimedOrderIds.has(normalized)) return false;
    this.claimedOrderIds.add(normalized);
    return true;
  }
}

export class BitrefillProvider {
  constructor(transport) {
    if (!transport || !["http", "fake"].includes(transport.kind)) throw new Error("BITREFILL_TRANSPORT_INVALID");
    this.transport = transport;
    this.capabilities = BITREFILL_CAPABILITIES;
  }
  async readCatalog(input) {
    const result = await this.transport.readCatalog(input);
    return { ...result, products: result.products.map(normalizeBitrefillProduct) };
  }
  async readProduct(productId) {
    const result = await this.transport.readProduct(productId);
    return normalizeBitrefillProduct(result.product);
  }
  async readAvailability(productId) {
    const product = await this.readProduct(productId);
    return { available: product.availability === "available", supplierQuantity: null, supplierQuantityKnown: false };
  }
  async createOrder(request) {
    if (this.transport.kind !== "fake") throw new BitrefillTransportError("PURCHASE_DISABLED");
    return this.transport.createInvoice(request);
  }
}
