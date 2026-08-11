const CNY_SCALE = 100;

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function toCnyCents(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const cents = Math.round((value + Number.EPSILON) * CNY_SCALE);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function formatCnyFromCents(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) return "0.00";
  return (cents / CNY_SCALE).toFixed(2);
}

export function parseAccountAssetsBalance(payload) {
  if (!isPlainObject(payload) || !isPlainObject(payload.summary)) {
    return { kind: "unavailable", reason: "invalid_payload" };
  }
  if (isPlainObject(payload.diagnostics) && payload.diagnostics.profileError) {
    return { kind: "unavailable", reason: "profile_unavailable" };
  }
  const balanceCents = toCnyCents(payload.summary.availableBalance);
  if (balanceCents === null) {
    return { kind: "unavailable", reason: "invalid_balance" };
  }
  return {
    kind: "ready",
    balanceCents,
    balance: balanceCents / CNY_SCALE,
  };
}

export function evaluateCheckoutBalance(orderAmount, availableBalance) {
  const orderCents = toCnyCents(orderAmount);
  const balanceCents = toCnyCents(availableBalance);
  if (orderCents === null || balanceCents === null) {
    return { kind: "unavailable" };
  }
  const sufficient = balanceCents >= orderCents;
  const remainingCents = sufficient ? balanceCents - orderCents : 0;
  const shortfallCents = sufficient ? 0 : orderCents - balanceCents;
  return {
    kind: "ready",
    sufficient,
    orderCents,
    balanceCents,
    remainingCents,
    shortfallCents,
    orderAmount: orderCents / CNY_SCALE,
    availableBalance: balanceCents / CNY_SCALE,
    remainingAmount: remainingCents / CNY_SCALE,
    shortfallAmount: shortfallCents / CNY_SCALE,
  };
}

export function getBalanceSubmissionBlockReason({ paymentMethod, balanceStatus, balanceSummary }) {
  if (paymentMethod !== "balance") return null;
  if (balanceStatus === "loading") return "BALANCE_LOADING";
  if (balanceStatus !== "ready" || balanceSummary?.kind !== "ready") return "BALANCE_UNAVAILABLE";
  return balanceSummary.sufficient ? null : "BALANCE_INSUFFICIENT";
}

export function classifyCheckoutOrderResponse(status, payload) {
  if (!isPlainObject(payload)) return { kind: "invalid_response", orderNo: null, requestId: null };
  const order = isPlainObject(payload.order) ? payload.order : null;
  const nestedOrderNo = typeof order?.order_no === "string" ? order.order_no.trim() : "";
  const topLevelOrderNo = typeof payload.order_no === "string" ? payload.order_no.trim() : "";
  const orderNo = nestedOrderNo || topLevelOrderNo || null;
  const requestId = typeof payload.request_id === "string" && payload.request_id.trim()
    ? payload.request_id.trim()
    : null;

  const code = typeof payload.code === "string" ? payload.code.trim() : "";
  if (status === 402 && code === "BALANCE_INSUFFICIENT" && orderNo) {
    return { kind: "balance_insufficient_existing_order", orderNo, requestId };
  }
  if (status >= 200 && status < 300 && orderNo) {
    return { kind: "success", orderNo, requestId };
  }
  if (status >= 400 && orderNo) {
    return { kind: "existing_order_payment_error", orderNo, requestId };
  }
  return { kind: "failed", orderNo, requestId };
}

const RETAINED_TERMINAL_ORDER_STATUSES = new Set([
  "expired",
  "failed",
  "cancelled",
  "refunded",
  "closed",
  "paid",
  "delivered",
  "completed",
]);

const RETAINED_TERMINAL_PAYMENT_STATUSES = new Set([
  "paid",
  "failed",
  "refunded",
  "partially_refunded",
]);

export function classifyRetainedCheckoutOrder(payload, expectedOrderNo) {
  if (!isPlainObject(payload) || !isPlainObject(payload.order)) {
    return { kind: "unknown", customerEmail: null };
  }

  const expected = typeof expectedOrderNo === "string" ? expectedOrderNo.trim() : "";
  const actual = typeof payload.order.order_no === "string" ? payload.order.order_no.trim() : "";
  if (!expected || actual !== expected) {
    return { kind: "unknown", customerEmail: null };
  }

  const status = typeof payload.order.status === "string" ? payload.order.status.trim().toLowerCase() : "";
  const paymentStatus = typeof payload.order.payment_status === "string"
    ? payload.order.payment_status.trim().toLowerCase()
    : "";
  const customerEmail = typeof payload.order.customer_email === "string" && payload.order.customer_email.trim()
    ? payload.order.customer_email.trim()
    : null;

  if (status === "pending_payment" && paymentStatus === "unpaid") {
    return { kind: "payable", customerEmail };
  }
  if (RETAINED_TERMINAL_ORDER_STATUSES.has(status) || RETAINED_TERMINAL_PAYMENT_STATUSES.has(paymentStatus)) {
    return { kind: "terminal", customerEmail };
  }
  if (status && paymentStatus) {
    return { kind: "terminal", customerEmail };
  }
  return { kind: "unknown", customerEmail };
}

export function parseRetainedCheckoutOrder(value) {
  if (!isPlainObject(value)) return null;
  const requestId = typeof value.requestId === "string" ? value.requestId.trim() : "";
  const orderNo = typeof value.orderNo === "string" ? value.orderNo.trim() : "";
  if (!requestId || !orderNo) return null;
  const customerEmail = typeof value.customerEmail === "string" && value.customerEmail.trim()
    ? value.customerEmail.trim()
    : null;
  return { requestId, orderNo, customerEmail };
}

export function getRetainedOrderCustomerEmail(payload, expectedOrderNo) {
  if (!isPlainObject(payload) || !isPlainObject(payload.order)) return null;
  const expected = typeof expectedOrderNo === "string" ? expectedOrderNo.trim() : "";
  const actual = typeof payload.order.order_no === "string" ? payload.order.order_no.trim() : "";
  if (!expected || actual !== expected) return null;
  return typeof payload.order.customer_email === "string" && payload.order.customer_email.trim()
    ? payload.order.customer_email.trim()
    : null;
}

export function createCheckoutSubmissionGuard() {
  let active = false;
  return {
    tryStart() {
      if (active) return false;
      active = true;
      return true;
    },
    finish() {
      active = false;
    },
    isActive() {
      return active;
    },
  };
}
