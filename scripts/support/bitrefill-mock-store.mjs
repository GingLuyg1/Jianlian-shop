// Synthetic-only compatibility client for the existing purchase RPC adapter.
// This is NOT DB9 SQL, a production database client, or a replacement ledger.
import { randomUUID } from "node:crypto";

export const mockBinding = Object.freeze({ fulfillment_source: "supplier", supplier: "bitrefill",
  supplier_product_id: "mock-gift-us", supplier_sku: "mock-us-5", supplier_currency: "USD",
  supplier_face_value: "5.00", supplier_max_unit_cost: "5.00", supplier_min_unit_profit: "1.00" });
export function emptyMockState() {
  return { orders: [], order_items: [], supplier_fulfillment_requests: [], supplier_purchase_attempts: [],
    supplier_purchase_attempt_items: [], supplier_external_orders: [], evidence: [], receipts: [],
    privateDeliveries: [], ledger: [], balances: { "mock-customer": 100000, "mock-other": 100000 } };
}
export function createMemoryMockBackend() {
  let state = emptyMockState();
  let tail = Promise.resolve();
  return { read: async () => structuredClone(state), transact(fn) {
    const run = tail.then(() => { const copy = structuredClone(state); const value = fn(copy); state = copy; return structuredClone(value); });
    tail = run.catch(() => {}); return run;
  } };
}
const need = (condition, code) => { if (!condition) throw new Error(code); };
const one = (state, table, id) => { const row = state[table].find((r) => r.id === id); need(row, "MOCK_RECORD_NOT_FOUND"); return row; };
const id = () => randomUUID();

export function createMockService(backend) {
  const mutate = (fn) => backend.transact(fn);
  const rpc = async (name, a) => {
    try { return { data: await mutate((s) => {
      if (name === "pay_order_with_balance") {
        const order = one(s, "orders", a.p_order_id);
        need(order.user_id === a.p_user_id, "MOCK_OWNER_REQUIRED");
        if (order.payment_status === "paid") return { ok: true, idempotent: true, orderId: order.id, paymentStatus: "paid", status: order.status };
        need(order.status === "pending_payment" && order.payment_status === "unpaid", "MOCK_PAYMENT_BLOCKED");
        need(s.balances[order.user_id] >= order.total_cents, "MOCK_INSUFFICIENT_BALANCE");
        s.balances[order.user_id] -= order.total_cents;
        s.ledger.push({ id: `debit:${order.id}`, owner: order.user_id, order_id: order.id, cents: -order.total_cents });
        order.payment_status = "paid"; order.status = "paid";
        return { ok: true, idempotent: false, orderId: order.id, paymentStatus: "paid", status: "paid" };
      }
      if (name === "claim_supplier_fulfillment") {
        const order = one(s, "orders", a.p_order_id), item = one(s, "order_items", a.p_order_item_id);
        need(order.payment_status === "paid" && item.order_id === order.id && !item.refunded, "MOCK_PAID_ITEM_REQUIRED");
        let root = s.supplier_fulfillment_requests.find((r) => r.order_item_id === item.id);
        if (!root) {
          root = { id: id(), order_id: order.id, order_item_id: item.id, supplier: "bitrefill",
            supplier_product_id: a.p_supplier_product_id, supplier_sku: a.p_supplier_sku,
            request_id: a.p_request_id, attempt_token: id(), status: "PURCHASING" };
          s.supplier_fulfillment_requests.push(root);
        }
        return { ...root, action: root.status === "FULFILLED" ? "NONE" : "PURCHASE" };
      }
      if (name === "internal_supplier_purchase_claim") {
        let attempt = s.supplier_purchase_attempts.find((r) => r.logical_request_key === a.p_logical_key);
        if (attempt) {
          need(attempt.semantic_request_hash === a.p_semantic_hash, "MOCK_SEMANTIC_CONFLICT");
          return { result: "ALREADY_CLAIMED", attempt_id: attempt.id };
        }
        need(a.p_items.length > 0 && a.p_items.length <= 20, "MOCK_UNITS_INVALID");
        for (const item of a.p_items) {
          const root = one(s, "supplier_fulfillment_requests", item.fulfillment_request_id);
          const order = one(s, "orders", root.order_id);
          need(order.payment_status === "paid" && root.order_item_id === item.order_item_id && root.status === "PURCHASING", "MOCK_CLAIM_BLOCKED");
          need(!s.supplier_purchase_attempt_items.some((r) => r.order_item_id === item.order_item_id && r.unit_index === item.unit_index), "MOCK_DUPLICATE_UNIT");
        }
        attempt = { id: id(), supplier: "bitrefill", logical_request_key: a.p_logical_key,
          semantic_request_hash: a.p_semantic_hash, status: "CLAIMED", external_invoice_id: null };
        s.supplier_purchase_attempts.push(attempt);
        for (const item of a.p_items) s.supplier_purchase_attempt_items.push({ ...item, id: id(), attempt_id: attempt.id });
        return { result: "CLAIMED", attempt_id: attempt.id };
      }
      if (name === "internal_supplier_purchase_transition") {
        const row = one(s, "supplier_purchase_attempts", a.p_attempt_id);
        if (row.status !== a.p_expected_status) return { result: "STALE" };
        need(["CLAIMED:SUBMITTING", "SUBMITTING:UNCERTAIN", "SUBMITTING:EXTERNAL_CREATED"].includes(`${row.status}:${a.p_next_status}`), "MOCK_TRANSITION_BLOCKED");
        row.status = a.p_next_status; row.external_invoice_id = a.p_external_invoice_id;
        return { result: "TRANSITIONED" };
      }
      if (name === "internal_supplier_purchase_record_child") {
        const item = one(s, "supplier_purchase_attempt_items", a.p_attempt_item_id);
        const existing = s.supplier_external_orders.find((r) => r.attempt_item_id === item.id || r.external_order_id === a.p_external_order_id);
        if (existing) {
          need(existing.attempt_item_id === item.id && existing.external_order_id === a.p_external_order_id, "MOCK_CHILD_COLLISION");
          return { external_order_row_id: existing.id };
        }
        const child = { id: id(), attempt_id: item.attempt_id, attempt_item_id: item.id, supplier: "bitrefill",
          external_order_id: a.p_external_order_id, normalized_status: "PENDING" };
        s.supplier_external_orders.push(child); return { external_order_row_id: child.id };
      }
      if (name === "internal_supplier_purchase_record_evidence") {
        const child = one(s, "supplier_external_orders", a.p_external_order_row_id);
        need(child.attempt_id === a.p_attempt_id, "MOCK_EVIDENCE_IDENTITY");
        // Terminal evidence cannot be regressed by delayed notifications.
        if (!["DELIVERED", "FAILED", "REFUNDED"].includes(child.normalized_status)) child.normalized_status = a.p_status;
        if (!s.evidence.some((e) => e.fingerprint === a.p_safe_fingerprint)) s.evidence.push({
          child_id: child.id, status: child.normalized_status, fingerprint: a.p_safe_fingerprint });
        return { result: "RECORDED" };
      }
      if (name === "internal_supplier_purchase_record_webhook") {
        const duplicate = s.receipts.includes(a.p_event_fingerprint);
        if (!duplicate) s.receipts.push(a.p_event_fingerprint);
        return { result: duplicate ? "DUPLICATE" : "RECEIVED" };
      }
      if (name === "internal_supplier_purchase_deliver_child") {
        const child = one(s, "supplier_external_orders", a.p_external_order_row_id);
        const item = one(s, "supplier_purchase_attempt_items", child.attempt_item_id);
        const root = one(s, "supplier_fulfillment_requests", item.fulfillment_request_id);
        const order = one(s, "orders", root.order_id), sale = one(s, "order_items", root.order_item_id);
        need(order.payment_status === "paid" && !sale.refunded && child.normalized_status === "DELIVERED" &&
          root.request_id === a.p_request_id && root.attempt_token === a.p_attempt_token, "MOCK_PRIVATE_WRITE_BLOCKED");
        const content = JSON.parse(a.p_delivery_content);
        need(typeof content.code === "string" && content.code.startsWith("MOCK-CARD-"), "MOCK_SYNTHETIC_SECRET_REQUIRED");
        const existing = s.privateDeliveries.find((r) => r.item_id === sale.id);
        if (existing) return { ok: true, idempotent: true, delivery_id: existing.id };
        const delivery = { id: id(), item_id: sale.id, order_id: order.id, owner: order.user_id, content };
        s.privateDeliveries.push(delivery); sale.delivery_status = "delivered"; root.status = "FULFILLED";
        order.status = s.order_items.filter((r) => r.order_id === order.id).every((r) => r.delivery_status === "delivered") ? "delivered" : "processing";
        return { ok: true, idempotent: false, delivery_id: delivery.id };
      }
      if (name === "record_supplier_fulfillment_outcome") {
        const row = s.supplier_fulfillment_requests.find((r) => r.order_item_id === a.p_order_item_id);
        need(row?.attempt_token === a.p_attempt_token, "MOCK_ROOT_TOKEN_REQUIRED");
        if (row.status !== "FULFILLED") { row.status = a.p_status; row.error_code = a.p_error_code; }
        return { ok: true };
      }
      if (name === "reserve_local_inventory_for_daju_order") return { ok: true, local_ready_count: 0, supplier_fallback_count: 1, blocked_count: 0 };
      if (name === "deliver_digital_order") return { ok: true, delivered_count: 0 };
      throw new Error("MOCK_RPC_NOT_SUPPORTED");
    }), error: null }; } catch (error) { return { data: null, error: { code: error.message } }; }
  };
  return { backend, rpc, from(table) {
    need(["orders", "order_items", "supplier_fulfillment_requests", "supplier_purchase_attempts",
      "supplier_purchase_attempt_items", "supplier_external_orders"].includes(table), "MOCK_TABLE_BLOCKED");
    return { select(columns) { return { eq(field, value) {
      const run = async (single) => {
        const s = await backend.read();
        const rows = s[table].filter((r) => r[field] === value).map((r) => Object.fromEntries(columns.split(",").map((c) => [c, r[c]])));
        return single && rows.length !== 1 ? { data: null, error: { code: "MOCK_SINGLE_REQUIRED" } } : { data: single ? rows[0] : rows, error: null };
      };
      return { then: (ok, fail) => run(false).then(ok, fail), single: () => run(true) };
    } }; } };
  }, async createOrder(owner, requestId, count = 1) {
    need(["mock-customer", "mock-other"].includes(owner) && /^[a-z0-9-]{1,80}$/.test(requestId) && Number.isInteger(count) && count >= 1 && count <= 5, "MOCK_ORDER_INPUT");
    return mutate((s) => {
      const existing = s.orders.find((r) => r.user_id === owner && r.request_id === requestId);
      if (existing) { need(existing.total_cents === count * 600, "MOCK_ORDER_REQUEST_CONFLICT"); return existing; }
      const order = { id: id(), order_no: `MOCK-${id()}`, user_id: owner, request_id: requestId,
        currency: "USD", total_cents: count * 600, status: "pending_payment", payment_status: "unpaid" };
      s.orders.push(order);
      for (let n = 0; n < count; n++) s.order_items.push({ id: id(), order_id: order.id, product_id: "mock-local-product",
        sku_id: "mock-local-sku", quantity: 1, unit_price: "6.00", delivery_type: "auto_delivery", delivery_status: "pending",
        product_snapshot: { supplier_binding: { ...mockBinding } } });
      return order;
    });
  }, async refundFailedItem(itemId) {
    return mutate((s) => {
      const item = one(s, "order_items", itemId), order = one(s, "orders", item.order_id);
      need(order.payment_status === "paid", "MOCK_REFUND_UNPAID");
      const unit = s.supplier_purchase_attempt_items.find((r) => r.order_item_id === itemId);
      const child = s.supplier_external_orders.find((r) => r.attempt_item_id === unit?.id);
      need(child?.normalized_status === "FAILED" && item.delivery_status !== "delivered" &&
        !s.privateDeliveries.some((r) => r.item_id === itemId), "MOCK_REFUND_MANUAL_REVIEW");
      if (item.refunded) return { refunded: true, idempotent: true };
      need(s.ledger.some((r) => r.id === `debit:${order.id}`), "MOCK_REFUND_NO_DEBIT");
      const refunded = s.ledger.filter((r) => r.order_id === order.id && r.cents > 0).reduce((n, r) => n + r.cents, 0);
      need(refunded + 600 <= order.total_cents, "MOCK_REFUND_CAP");
      s.ledger.push({ id: `refund:${itemId}`, owner: order.user_id, order_id: order.id, cents: 600 });
      s.balances[order.user_id] += 600; item.refunded = true;
      return { refunded: true, idempotent: false };
    });
  } };
}
