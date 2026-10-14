const FINAL_INVOICE_STATUSES = new Set(["complete", "denied", "payment_error"]);
const ORDER_STATUSES = new Set(["created", "payment_detected", "processing", "delivered", "failed", "refunded"]);
const SENSITIVE_KEYS = /authorization|api[_-]?(?:key|secret|id)|token|password|redemption|code|pin|barcode|secret|credential/i;

export function isPlainRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedText(value, max = 200) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= max && !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(text) ? text : null;
}

function boundedExternalId(value) {
  const text = boundedText(value, 200);
  return text && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(text) ? text : null;
}

function finiteNumber(value) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function parsePackage(value) {
  if (!isPlainRecord(value)) return null;
  const packageId = boundedText(value.package_id ?? value.id);
  const packageValue = typeof value.value === "string" && /^(0|[1-9]\d{0,8})(?:\.\d{1,8})?$/.test(value.value) && Number(value.value) > 0
    ? value.value
    : typeof value.value === "number" && Number.isFinite(value.value) && value.value > 0 && value.value <= 1_000_000_000
      ? value.value
      : null;
  const price = value.price === undefined ? null : finiteNumber(value.price);
  if (!packageId || packageValue === null || (value.price !== undefined && price === null)
      || (price !== null && (price < 0 || price > 1_000_000_000))) return null;
  return { packageId, value: packageValue, price };
}

function parseRange(value) {
  if (value === undefined || value === null) return null;
  if (!isPlainRecord(value)) return undefined;
  const min = finiteNumber(value.min);
  const max = finiteNumber(value.max);
  const step = finiteNumber(value.step);
  const priceRate = value.price_rate === undefined ? null : finiteNumber(value.price_rate);
  if (min === null || max === null || step === null || min < 0 || max < min || max > 1_000_000_000 || step <= 0
      || (value.price_rate !== undefined && priceRate === null) || (priceRate !== null && priceRate <= 0)) {
    return undefined;
  }
  return { min, max, step, priceRate };
}

export function parseBitrefillProduct(value) {
  if (!isPlainRecord(value)) return null;
  const id = boundedText(value.id);
  const name = boundedText(value.name, 300);
  const country = boundedText(value.country_code ?? value.country, 2);
  const currency = boundedText(value.currency, 12);
  const type = boundedText(value.type, 80) ?? "unknown";
  if (!id || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(id) || !name || /[<>]/u.test(name)
      || !country || !/^[A-Z]{2}$/.test(country) || !currency || !/^[A-Z]{3}$/.test(currency)
      || typeof value.in_stock !== "boolean") return null;

  let rawPackages = value.packages ?? [];
  if (isPlainRecord(rawPackages)) rawPackages = [rawPackages];
  if (!Array.isArray(rawPackages) || rawPackages.length > 50) return null;
  const packages = rawPackages.map(parsePackage);
  if (packages.some((entry) => entry === null)) return null;
  const range = parseRange(value.range);
  if (range === undefined) return null;

  return {
    id,
    name,
    country,
    currency,
    type,
    inStock: value.in_stock,
    packages,
    range,
  };
}

function parseMeta(value) {
  if (!isPlainRecord(value)) return { start: 0, limit: 0, totalResults: null, next: null };
  const start = Number.isInteger(value.start) && value.start >= 0 ? value.start : 0;
  const limit = Number.isInteger(value.limit) && value.limit >= 0 ? value.limit : 0;
  const totalResults = Number.isInteger(value.total_results) && value.total_results >= 0 ? value.total_results : null;
  const next = boundedText(value._next, 2000);
  return { start, limit, totalResults, next };
}

export function parseBitrefillProductsResponse(value) {
  if (!isPlainRecord(value) || !Array.isArray(value.data) || value.data.length > 50) return null;
  const products = value.data.map(parseBitrefillProduct);
  if (products.some((entry) => entry === null)) return null;
  return { products, meta: parseMeta(value.meta) };
}

export function parseBitrefillProductResponse(value) {
  if (!isPlainRecord(value)) return null;
  return parseBitrefillProduct(value.data);
}

export function parseBitrefillPingResponse(value) {
  return isPlainRecord(value) && value.message === "pong" ? { message: "pong" } : null;
}

function headerInteger(headers, name) {
  const raw = headers?.get?.(name);
  if (raw === null || raw === undefined || raw === "") return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function parseBitrefillRateLimitHeaders(headers) {
  return {
    limit: headerInteger(headers, "x-ratelimit-limit"),
    remaining: headerInteger(headers, "x-ratelimit-remaining"),
    reset: headerInteger(headers, "x-ratelimit-reset"),
    productQuotaRemaining: headerInteger(headers, "x-product-quota-remaining"),
    productQuotaNextWindow: headerInteger(headers, "x-product-quota-next-window"),
  };
}

export function mapBitrefillAvailability(product) {
  if (!product || typeof product.inStock !== "boolean") throw new Error("BITREFILL_PRODUCT_AVAILABILITY_INVALID");
  return { available: product.inStock, supplierQuantity: null, evidence: "bitrefill_in_stock_boolean" };
}

function parseWebhookOrder(value) {
  if (!isPlainRecord(value)) return null;
  const id = boundedExternalId(value.id);
  const status = boundedText(value.status, 40);
  if (!id || !status || !ORDER_STATUSES.has(status)) return null;
  return { id, status };
}

export function parseBitrefillWebhookEnvelope(value) {
  if (!isPlainRecord(value)) return null;
  const invoice = isPlainRecord(value.data) ? value.data : value;
  const id = boundedExternalId(invoice.id);
  const status = boundedText(invoice.status, 40);
  if (!id || !status || !FINAL_INVOICE_STATUSES.has(status) || !Array.isArray(invoice.orders) || invoice.orders.length > 20) return null;
  const orders = invoice.orders.map(parseWebhookOrder);
  if (orders.some((entry) => entry === null)) return null;
  return { invoiceId: id, status, orders };
}

export function evaluateBitrefillInvoiceOutcome(invoice) {
  if (!invoice || !FINAL_INVOICE_STATUSES.has(invoice.status) || !Array.isArray(invoice.orders)) {
    throw new Error("BITREFILL_INVOICE_INVALID");
  }
  const deliveredOrderIds = invoice.orders.filter((order) => order.status === "delivered").map((order) => order.id);
  const nonDeliveredOrderIds = invoice.orders.filter((order) => order.status !== "delivered").map((order) => order.id);
  return {
    invoiceComplete: invoice.status === "complete",
    allOrdersDelivered: invoice.status === "complete" && invoice.orders.length > 0 && nonDeliveredOrderIds.length === 0,
    deliveredOrderIds,
    nonDeliveredOrderIds,
  };
}

export function createBitrefillWebhookIdempotencyKey(invoice) {
  if (!invoice?.invoiceId || !Array.isArray(invoice.orders)) throw new Error("BITREFILL_WEBHOOK_INVALID");
  const orderState = [...invoice.orders]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((order) => `${order.id}:${order.status}`)
    .join(",");
  return `bitrefill:webhook:${invoice.invoiceId}:${invoice.status}:${orderState}`;
}

export function redactBitrefillLogValue(value, depth = 0) {
  if (depth > 6) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((entry) => redactBitrefillLogValue(entry, depth + 1));
  if (!isPlainRecord(value)) return value;
  const safe = {};
  for (const [key, entry] of Object.entries(value)) {
    safe[key] = SENSITIVE_KEYS.test(key) ? "[REDACTED]" : redactBitrefillLogValue(entry, depth + 1);
  }
  return safe;
}
