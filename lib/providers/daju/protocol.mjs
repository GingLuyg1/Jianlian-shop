const DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;

export const DAJU_PROVIDER = "daju";
export const DAJU_TERMINAL_FAILURE_CODES = new Set([
  "INSUFFICIENT_BALANCE",
  "OUT_OF_STOCK",
  "PRODUCT_NOT_FOUND",
  "ORDERING_CLOSED",
  "PAYMENT_UNAVAILABLE",
]);
export const DAJU_UNCERTAIN_CODES = new Set([
  "REQUEST_PROCESSING",
  "IDEMPOTENCY_UNAVAILABLE",
  "UPSTREAM_UNAVAILABLE",
]);

export function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function text(value, max = 500) {
  return typeof value === "string" && value.trim() && value.trim().length <= max
    ? value.trim()
    : null;
}

function integer(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum ? value : null;
}

export function parseDajuDecimal(value) {
  const normalized = typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : typeof value === "string"
      ? value.trim()
      : "";
  return DECIMAL_PATTERN.test(normalized) ? normalized : null;
}

function unwrap(value, collectionKey) {
  if (Array.isArray(value)) return value;
  if (!isPlainRecord(value)) return value;
  if (collectionKey in value && (Array.isArray(value[collectionKey]) || isPlainRecord(value[collectionKey]))) {
    return value[collectionKey];
  }
  if (isPlainRecord(value.data) && collectionKey in value.data && (Array.isArray(value.data[collectionKey]) || isPlainRecord(value.data[collectionKey]))) {
    return value.data[collectionKey];
  }
  if ("data" in value) return value.data;
  return value;
}

export function parseDajuProduct(value) {
  if (!isPlainRecord(value)) return null;
  const id = integer(value.id, 1);
  const title = text(value.title, 300);
  const price = parseDajuDecimal(value.price);
  const stock = integer(value.stock, 0);
  const sales = integer(value.sales, 0);
  if (id === null || !title || price === null || stock === null || sales === null || typeof value.is_auto !== "boolean") {
    return null;
  }
  return {
    id,
    title,
    price,
    stock,
    sales,
    isAuto: value.is_auto,
    cover: text(value.cover, 2000),
    sortId: value.sort_id === null || value.sort_id === undefined ? null : integer(value.sort_id, 0),
  };
}

export function parseDajuProductsResponse(value) {
  const rows = unwrap(value, "products");
  if (!Array.isArray(rows)) return null;
  const products = rows.map(parseDajuProduct);
  return products.every(Boolean) ? products : null;
}

function parseStringList(value, maxItems = 100) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const values = value.map((entry) => text(entry, 120));
  return values.every(Boolean) ? values : null;
}

export function parseDajuProductDetailResponse(value) {
  const row = unwrap(value, "product");
  const base = parseDajuProduct(row);
  if (!base || !isPlainRecord(row)) return null;
  const minQty = integer(row.min_qty, 1);
  const maxQty = integer(row.max_qty, 0);
  const requiredInputs = parseStringList(row.required_inputs);
  if (
    minQty === null
    || maxQty === null
    || (maxQty !== 0 && maxQty < minQty)
    || requiredInputs === null
    || typeof row.is_sku !== "boolean"
  ) {
    return null;
  }
  const specs = row.specs === undefined || row.specs === null ? [] : row.specs;
  const skuVariants = row.sku_variants === undefined || row.sku_variants === null ? [] : row.sku_variants;
  if (!Array.isArray(specs) || !Array.isArray(skuVariants)) return null;
  return {
    ...base,
    isSku: row.is_sku,
    description: text(row.description, 20_000),
    minQty,
    maxQty,
    specs,
    skuVariants,
    requiredInputs,
  };
}

export function parseDajuBalanceResponse(value) {
  const row = unwrap(value, "balance");
  if (!isPlainRecord(row)) return null;
  const balance = parseDajuDecimal(row.balance);
  const name = text(row.name, 200);
  const totalSpent = parseDajuDecimal(row.total_spent);
  const totalOrders = integer(row.total_orders, 0);
  if (balance === null || !name || totalSpent === null || totalOrders === null) return null;
  return { balance, name, totalSpent, totalOrders };
}

export function parseDajuDelivered(value) {
  if (typeof value === "string") {
    const normalized = text(value, 20_000);
    return normalized ? [normalized] : [];
  }
  if (!Array.isArray(value) || value.length > 100) return null;
  const delivered = value.map((entry) => text(entry, 20_000));
  return delivered.every(Boolean) ? delivered : null;
}

export function parseDajuOrderResponse(value) {
  const row = unwrap(value, "order");
  if (!isPlainRecord(row)) return null;
  const orderCode = text(row.order_code, 160);
  const requestId = text(row.request_id, 240);
  const quantity = integer(row.quantity, 1);
  const unitPrice = parseDajuDecimal(row.unit_price);
  const totalPrice = parseDajuDecimal(row.total_price);
  const status = text(row.status, 80);
  const delivered = parseDajuDelivered(row.delivered);
  if (!orderCode || quantity === null || unitPrice === null || totalPrice === null || !status || delivered === null) return null;
  if (row.duplicate !== undefined && typeof row.duplicate !== "boolean") return null;
  const productId = row.product_id === undefined || row.product_id === null ? null : integer(row.product_id, 1);
  const sku = row.sku === undefined || row.sku === null ? null : text(row.sku, 200);
  if ((row.product_id !== undefined && row.product_id !== null && productId === null)
      || (row.sku !== undefined && row.sku !== null && !sku)) return null;
  return {
    orderCode,
    requestId,
    quantity,
    unitPrice,
    totalPrice,
    balanceAfter: row.balance_after === undefined || row.balance_after === null
      ? null
      : parseDajuDecimal(row.balance_after),
    status,
    delivered,
    duplicate: row.duplicate === true,
    createdAt: text(row.created_at, 100),
    productId,
    sku,
  };
}

export function parseDajuPurchaseReference(value) {
  const row = unwrap(value, "order");
  if (!isPlainRecord(row)) return null;
  const orderCode = text(row.order_code, 160);
  const requestId = row.request_id === undefined || row.request_id === null
    ? null
    : text(row.request_id, 240);
  if (!orderCode || (row.request_id !== undefined && row.request_id !== null && !requestId)) return null;
  return { orderCode, requestId };
}

export function parseDajuErrorResponse(value, httpStatus) {
  if (!isPlainRecord(value)) return { code: httpStatus === 429 ? "RATE_LIMITED" : "UPSTREAM_UNAVAILABLE" };
  const nested = isPlainRecord(value.error) ? value.error : value;
  const code = text(nested.code, 80) ?? text(nested.error_code, 80);
  return { code: code ?? (httpStatus === 429 ? "RATE_LIMITED" : "UPSTREAM_UNAVAILABLE") };
}

export function classifyDajuPurchaseFailure(code) {
  if (DAJU_TERMINAL_FAILURE_CODES.has(code)) return { state: "FAILED", retryable: false };
  if (code === "RATE_LIMITED") return { state: "PENDING", retryable: true };
  if (DAJU_UNCERTAIN_CODES.has(code)) return { state: "UNCERTAIN", retryable: false };
  return { state: "UNCERTAIN", retryable: false };
}

export function createDajuRequestId(orderId, orderItemId) {
  const order = text(orderId, 100);
  const item = text(orderItemId, 100);
  if (!order || !item || !/^[a-zA-Z0-9-]+$/.test(order) || !/^[a-zA-Z0-9-]+$/.test(item)) return null;
  return `jianlian:${order}:${item}`;
}

export function redactDajuLogValue(value) {
  if (!isPlainRecord(value)) return {};
  return {
    code: text(value.code, 80),
    status: text(value.status, 80),
    hasOrderCode: Boolean(text(value.orderCode ?? value.order_code, 160)),
    deliveredCount: Array.isArray(value.delivered) ? value.delivered.length : undefined,
  };
}
