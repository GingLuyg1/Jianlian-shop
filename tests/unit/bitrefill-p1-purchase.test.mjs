import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBitrefillProduct } from "../../lib/providers/bitrefill/provider-core.mjs";
import { BitrefillPurchaseHttpTransport } from "../../lib/providers/bitrefill/purchase-http-transport.mjs";
import { loadFreshBitrefillProduct, prepareBitrefillSingleItem, reconcileBitrefillSingleItem,
  deliverBitrefillSingleItem } from "../../lib/providers/bitrefill/single-item-purchase.mjs";
import { runBitrefillSingleItemPurchase } from "../../lib/providers/bitrefill/purchase-persistence.mjs";
import { BitrefillFakeTransport, BitrefillHttpTransport } from "../../lib/providers/bitrefill/transport.mjs";

const now = Date.parse("2026-10-15T00:00:00.000Z");
const product = normalizeBitrefillProduct({ id: "fixture-apple-us", name: "Fixture Apple US",
  country: "US", currency: "USD", type: "gift_card", inStock: true,
  packages: [{ packageId: "fixture-apple-5", value: 5, price: 4.8 }] });
const candidate = {
  order: { id: "order-1", status: "paid", payment_status: "paid", currency: "USD" },
  orderItem: { id: "item-1", order_id: "order-1", quantity: 1, delivery_type: "auto_delivery",
    delivery_status: "pending", unit_price: "6.00", product_snapshot: { supplier_binding: {
      fulfillment_source: "supplier", supplier: "bitrefill", supplier_product_id: "fixture-apple-us",
      supplier_sku: "fixture-apple-5", supplier_currency: "USD", supplier_face_value: "5.00",
      supplier_max_unit_cost: "5.00", supplier_min_unit_profit: "1.00",
    } } },
  root: { id: "root-1", order_id: "order-1", order_item_id: "item-1", status: "PURCHASING",
    supplier: "bitrefill", supplier_product_id: "fixture-apple-us", supplier_sku: "fixture-apple-5",
    attempt_token: "token-1" },
};
const quote = { source: "authenticated_supplier_cost", productId: "fixture-apple-us",
  packageId: "fixture-apple-5", currency: "USD", amount: "4.80",
  checkedAt: new Date(now).toISOString() };
const inputs = { candidate, product, productCheckedAt: new Date(now).toISOString(), quote, nowMs: now };

test("P2 frozen payment fee and internal SKU identity alter the durable semantic hash", async () => {
  const hashes = [];
  for (const semanticContext of [{ orderId: "order-1", skuId: "sku-1", paymentFee: "0.10" },
    { orderId: "order-1", skuId: "sku-1", paymentFee: "0.20" },
    { orderId: "order-1", skuId: "sku-2", paymentFee: "0.10" }]) {
    let hash;
    const db = { claim: async (_supplier, _key, semanticHash) => {
      hash = semanticHash;
      hashes.push(hash);
      return { result: "CLAIMED", attempt_id: "attempt-1" };
    }, getAttempt: async () => ({ status: "CLAIMED", semantic_request_hash: hash }),
    transition: async () => ({ result: "TRANSITIONED" }) };
    await runBitrefillSingleItemPurchase({ db, transport: new BitrefillFakeTransport(),
      ...inputs, semanticContext });
  }
  assert.equal(new Set(hashes).size, 3);
});

function response(status, body) { return new Response(JSON.stringify(body), { status,
  headers: { "content-type": "application/json" } }); }

test("independent purchase transport defaults closed; GET-only transport still rejects POST", async () => {
  let called = 0;
  const transport = new BitrefillPurchaseHttpTransport({ authMode: "personal", apiKey: "fixture-secret",
    fetchImpl: async () => { called += 1; return response(200, { data: {} }); } });
  await assert.rejects(transport.createInvoice({ products: [{ product_id: "fixture-apple-us",
    package_id: "fixture-apple-5", quantity: 1 }] }), /BITREFILL_REAL_PURCHASE_DISABLED/);
  assert.equal(called, 0);
  assert.equal(transport.request, undefined);
  assert.throws(() => { transport.purchaseEnabled = true; }, TypeError);
  assert.equal(transport.purchaseEnabled, false);
  const readOnly = new BitrefillHttpTransport({ authMode: "personal", apiKey: "fixture-secret",
    fetchImpl: async () => { called += 1; return response(200, {}); } });
  assert.throws(() => readOnly.createInvoice({}), /READ_ONLY_MODE_METHOD_BLOCKED/);
  assert.equal(called, 0);
});

test("personal and business adapters construct one balance auto-pay invoice with blocked-network fetch", async () => {
  for (const credentials of [{ authMode: "personal", apiKey: "fixture-personal" },
    { authMode: "business", apiId: "fixture-id", apiSecret: "fixture-business" }]) {
    const calls = [];
    const transport = new BitrefillPurchaseHttpTransport({ ...credentials, purchaseEnabled: true,
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return response(200, { data: { id: "invoice-1", status: "pending", orders: [] } });
      } });
    const invoice = await transport.createInvoice({ products: [{ product_id: "fixture-apple-us",
      package_id: "fixture-apple-5", quantity: 1 }], payment_method: "bitcoin", auto_pay: false });
    assert.equal(invoice.id, "invoice-1");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.bitrefill.com/v2/invoices");
    assert.equal(calls[0].options.method, "POST");
    assert.deepEqual(JSON.parse(calls[0].options.body), { products: [{ product_id: "fixture-apple-us",
      package_id: "fixture-apple-5", quantity: 1 }], payment_method: "balance", auto_pay: true });
    assert.equal(calls[0].options.headers.Authorization.startsWith(
      credentials.authMode === "personal" ? "Bearer " : "Basic "), true);
    assert.equal(JSON.stringify(invoice).includes(credentials.apiKey ?? credentials.apiSecret), false);
  }
});

test("POST timeout is never retried; insufficient funds and malformed responses expose no raw secrets", async () => {
  let count = 0;
  const timeout = new BitrefillPurchaseHttpTransport({ authMode: "personal", apiKey: "fixture-secret",
    purchaseEnabled: true, fetchImpl: async () => { count += 1; throw new Error("fixture-secret RAW_BODY"); } });
  const request = { products: [{ product_id: "fixture-apple-us", package_id: "fixture-apple-5", quantity: 1 }] };
  await assert.rejects(timeout.createInvoice(request), (error) => error.code === "BITREFILL_POST_OUTCOME_UNCERTAIN"
    && error.submitted === true && !error.message.includes("fixture-secret"));
  assert.equal(count, 1);
  const funds = new BitrefillPurchaseHttpTransport({ authMode: "personal", apiKey: "fixture-secret",
    purchaseEnabled: true, fetchImpl: async () => response(403,
      { error_code: "balance_too_low", secret: "fixture-secret" }) });
  await assert.rejects(funds.createInvoice(request), (error) => error.code === "BITREFILL_BALANCE_TOO_LOW"
    && error.submitted === true && !error.message.includes("fixture-secret"));
  await assert.rejects(funds.createInvoice({ products: [{ ...request.products[0], quantity: 2 }] }),
    (error) => error.code === "BITREFILL_SINGLE_ITEM_REQUEST_REQUIRED" && error.submitted === false);
});

test("GET reconciliation uses exact invoice and child paths and retries only bounded 503", async () => {
  const calls = [];
  const transport = new BitrefillPurchaseHttpTransport({ authMode: "business", apiId: "id", apiSecret: "secret",
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method });
      if (calls.length === 1) return response(503, { error_code: "unavailable" });
      return response(200, { data: { id: "invoice-1", status: "pending", orders: [] } });
    }, sleep: async () => {} });
  assert.equal((await transport.readInvoice("invoice-1")).id, "invoice-1");
  assert.deepEqual(calls.map((call) => call.method), ["GET", "GET"]);
  assert.equal(calls[0].url, "https://api.bitrefill.com/v2/invoices/invoice-1");
  await transport.readOrder("child-1");
  assert.equal(calls[2].url, "https://api.bitrefill.com/v2/orders/child-1");
  await assert.rejects(transport.readInvoice("../accounts/balance"), /BITREFILL_EXTERNAL_ID_INVALID/);
});

test("fresh catalog loader normalizes authenticated GET and rejects product drift", async () => {
  const raw = { id: "fixture-apple-us", name: "Fixture Apple US", country_code: "US",
    currency: "USD", type: "gift_card", in_stock: true,
    packages: [{ package_id: "fixture-apple-5", value: 5, price: 4.8 }] };
  const result = await loadFreshBitrefillProduct({ readProduct: async () => raw }, "fixture-apple-us",
    () => new Date(now));
  assert.equal(result.product.availability, "available");
  assert.equal(result.productCheckedAt, new Date(now).toISOString());
  await assert.rejects(loadFreshBitrefillProduct({ readProduct: async () => ({ ...raw, id: "other" }) },
    "fixture-apple-us"), /BITREFILL_FRESH_PRODUCT_INVALID/);
});

test("paid, binding, availability, quote, cost, currency and profit gates fail closed before claim", () => {
  assert.equal(prepareBitrefillSingleItem({ ...inputs.candidate, product, productCheckedAt: inputs.productCheckedAt,
    quote, nowMs: now }).item.quantity, 1);
  const changes = [
    { order: { ...candidate.order, payment_status: "unpaid" } },
    { orderItem: { ...candidate.orderItem, quantity: 2 } },
    { orderItem: { ...candidate.orderItem, product_snapshot: {} } },
    { root: { ...candidate.root, supplier_sku: "wrong" } },
  ];
  for (const change of changes) assert.throws(() => prepareBitrefillSingleItem({ ...candidate,
    ...change, product, productCheckedAt: inputs.productCheckedAt, quote, nowMs: now }), /BITREFILL_/);
  for (const change of [{ amount: "5.01" }, { amount: "5.000001" }, { currency: "EUR" },
    { source: "face_value" }, { checkedAt: new Date(now - 600_000).toISOString() }]) {
    assert.throws(() => prepareBitrefillSingleItem({ ...candidate, product,
      productCheckedAt: inputs.productCheckedAt, quote: { ...quote, ...change }, nowMs: now }), /BITREFILL_/);
  }
  assert.throws(() => prepareBitrefillSingleItem({ ...candidate, product: { ...product, availability: "unavailable" },
    productCheckedAt: inputs.productCheckedAt, quote, nowMs: now }), /BITREFILL_FRESH_PRODUCT_REQUIRED/);
  assert.throws(() => prepareBitrefillSingleItem({ ...candidate, product,
    productCheckedAt: new Date(now - 600_000).toISOString(), quote, nowMs: now }), /BITREFILL_FRESH_PRODUCT_REQUIRED/);
  assert.throws(() => prepareBitrefillSingleItem({ ...candidate, product: { ...product, fixed_packages: [] },
    productCheckedAt: inputs.productCheckedAt, quote, nowMs: now }), /BITREFILL_PACKAGE_DRIFT/);
});

test("single-item reconciliation requires the only child to match GET order product and face", async () => {
  const state = { attempt: { id: "attempt-1", status: "EXTERNAL_CREATED", external_invoice_id: "invoice-1" },
    item: { id: "attempt-item-1", attempt_id: "attempt-1", order_item_id: "item-1", unit_index: 1,
      frozen_product_id: "fixture-apple-us", frozen_package_id: "fixture-apple-5", frozen_face_value: "5.00" },
    child: null, evidence: [] };
  const db = { getAttempt: async () => state.attempt, getAttemptItems: async () => [state.item],
    recordChild: async (_itemId, childId) => { state.child = childId; return { external_order_row_id: "row-1" }; },
    recordEvidence: async (...args) => { state.evidence.push(args); } };
  const transport = new BitrefillFakeTransport({ invoice: { id: "invoice-1", status: "complete",
    orders: [{ id: "child-1", status: "delivered" }] }, orders: { "child-1": { id: "child-1",
      status: "delivered", product: { id: "fixture-apple-us", value: 5 },
      redemption_info: { code: "SYNTHETIC_SECRET" } } } });
  const result = await reconcileBitrefillSingleItem({ db, transport, attemptId: "attempt-1" });
  assert.equal(result.deliveryCandidates.length, 1);
  assert.equal(state.child, "child-1");
  assert.equal(state.evidence.length, 1);
  assert.equal(JSON.stringify(result).includes("SYNTHETIC_SECRET"), false);
  transport.fixtures.invoice.status = "pending";
  assert.equal((await reconcileBitrefillSingleItem({ db, transport,
    attemptId: "attempt-1" })).deliveryCandidates.length, 0);
  transport.fixtures.invoice.status = "complete";
  delete transport.fixtures.orders["child-1"].redemption_info;
  assert.equal((await reconcileBitrefillSingleItem({ db, transport,
    attemptId: "attempt-1" })).deliveryCandidates.length, 0);
  transport.fixtures.orders["child-1"].redemption_info = { code: "SYNTHETIC_SECRET" };
  transport.fixtures.orders["child-1"].product.id = "wrong";
  await assert.rejects(reconcileBitrefillSingleItem({ db, transport, attemptId: "attempt-1" }),
    /BITREFILL_UNKNOWN_CHILD_MANUAL_REVIEW/);
  assert.equal(state.evidence.length, 3);
  transport.fixtures.invoice.orders.push({ id: "child-2", status: "delivered" });
  await assert.rejects(reconcileBitrefillSingleItem({ db, transport, attemptId: "attempt-1" }),
    /BITREFILL_UNKNOWN_CHILD_MANUAL_REVIEW/);
  assert.equal(state.evidence.length, 3);
});

test("single-item prepare runs before persistence and refuses disabled purchase transport", async () => {
  let claims = 0;
  const db = { claim: async () => { claims += 1; }, transition: async () => {}, getAttempt: async () => {} };
  const disabled = new BitrefillPurchaseHttpTransport({ authMode: "personal", apiKey: "fixture-secret",
    fetchImpl: async () => { throw new Error("network must not run"); } });
  await assert.rejects(runBitrefillSingleItemPurchase({ db, transport: disabled, ...inputs }),
    /BITREFILL_REAL_PURCHASE_DISABLED/);
  assert.equal(claims, 0);
  await assert.rejects(runBitrefillSingleItemPurchase({ db, transport: new BitrefillFakeTransport(),
    ...inputs, quote: { ...quote, amount: "5.01" } }), /BITREFILL_COST_OR_PROFIT_GATE_FAILED/);
  assert.equal(claims, 0);
});

test("delivery rechecks the sole child and uses private outcome only; duplicate result is idempotent", async () => {
  let writes = 0;
  const db = {
    getExternalChild: async () => ({ id: "row-1", supplier: "bitrefill", normalized_status: "DELIVERED",
      attempt_id: "attempt-1", attempt_item_id: "attempt-item-1", external_order_id: "child-1" }),
    getAttemptItem: async () => ({ id: "attempt-item-1", attempt_id: "attempt-1", unit_index: 1,
      fulfillment_request_id: "root-1", order_item_id: "item-1", frozen_product_id: "fixture-apple-us",
      frozen_package_id: "fixture-apple-5", frozen_face_value: "5.00" }),
    getAttempt: async () => ({ id: "attempt-1", external_invoice_id: "invoice-1" }),
    getRoot: async () => ({ id: "root-1", supplier: "bitrefill", status: "PURCHASING",
      order_item_id: "item-1", request_id: "request-1", attempt_token: "token-1" }),
    recordPrivateOutcome: async (_context, content) => {
      writes += 1;
      assert.equal(JSON.parse(content).code, "SYNTHETIC_SECRET");
      return { ok: true, delivery_id: "delivery-1", idempotent: writes > 1 };
    },
  };
  const transport = new BitrefillFakeTransport({ invoice: { id: "invoice-1", status: "complete",
    orders: [{ id: "child-1", status: "delivered" }] }, orders: { "child-1": { id: "child-1",
      status: "delivered", product: { id: "fixture-apple-us", value: 5 },
      redemption_info: { code: "SYNTHETIC_SECRET" } } } });
  assert.equal((await deliverBitrefillSingleItem({ db, transport, childRowId: "row-1" })).delivered, true);
  assert.equal((await deliverBitrefillSingleItem({ db, transport, childRowId: "row-1" })).idempotent, true);
  assert.equal(writes, 2);
  transport.fixtures.orders["child-1"].product.value = 10;
  await assert.rejects(deliverBitrefillSingleItem({ db, transport, childRowId: "row-1" }),
    /BITREFILL_UNKNOWN_CHILD_MANUAL_REVIEW/);
  assert.equal(writes, 2);
});
