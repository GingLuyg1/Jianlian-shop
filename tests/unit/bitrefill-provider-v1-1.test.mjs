import assert from "node:assert/strict";
import test from "node:test";

import { createBitrefillClient } from "../../lib/providers/bitrefill/client-core.mjs";
import {
  BITREFILL_CAPABILITIES,
  BitrefillDeliveryDeduplicator,
  BitrefillProvider,
  assertBitrefillCostWithinLimit,
  buildBitrefillInvoiceRequest,
  buildBitrefillLogMetadata,
  buildBitrefillSnapshot,
  classifyBitrefillSubmitFailure,
  normalizeBitrefillInvoice,
  normalizeBitrefillOrder,
  normalizeBitrefillProduct,
  normalizeBitrefillRedemption,
  planBitrefillInvoiceSplits,
  reconcileBitrefillInvoice,
} from "../../lib/providers/bitrefill/provider-core.mjs";
import { BitrefillFakeTransport, BitrefillHttpTransport } from "../../lib/providers/bitrefill/transport.mjs";
import { canSupplierAutoPurchase, discoverSupplierProvider } from "../../lib/providers/core/supplier-router-core.mjs";
import { parseBitrefillRateLimitHeaders, parseBitrefillWebhookEnvelope } from "../../lib/providers/bitrefill/protocol.mjs";

const rawProduct = {
  id: "fixture-gift-us",
  name: "Fixture Gift US",
  country: "US",
  currency: "USD",
  type: "gift_card",
  inStock: true,
  packages: [
    { packageId: "fixture-gift-us<&>10", value: 10, price: 9.5 },
    { packageId: "fixture-gift-us<&>25", value: 25, price: 23.5 },
  ],
  range: { min: 10, max: 200, step: 5, priceRate: 0.95 },
};

const product = normalizeBitrefillProduct(rawProduct);
const frozenItem = {
  binding: { supplier: "bitrefill", productId: "fixture-gift-us", sku: "fixture-gift-us<&>10" },
  product,
  quantity: 1,
  expectedCost: "9.50",
  frozenMaxSupplierCost: "10.00",
};

test("HTTP transport is GET-only and blocks invoice creation before fetch", async () => {
  let calls = 0;
  const transport = new BitrefillHttpTransport({
    authMode: "personal",
    apiKey: "fixture-key",
    fetchImpl: async () => { calls += 1; throw new Error("unexpected network"); },
  });
  assert.equal(transport.readOnlyMode, true);
  assert.throws(() => transport.createInvoice({ products: [] }), /READ_ONLY_MODE_METHOD_BLOCKED/);
  assert.equal(calls, 0);
});

test("provider discovery exposes Bitrefill read capabilities without auto-purchase", () => {
  const discovered = discoverSupplierProvider("bitrefill");
  assert.equal(discovered.capabilities.catalog, true);
  assert.equal(discovered.capabilities.purchase, false);
  assert.equal(canSupplierAutoPurchase("bitrefill"), false);
  assert.equal(canSupplierAutoPurchase("daju"), true);
  assert.equal(BITREFILL_CAPABILITIES.variableAmountPurchase, false);
});

test("provider normalizes stable product/package/range and boolean-only availability", () => {
  assert.equal(product.provider, "bitrefill");
  assert.equal(product.external_product_id, "fixture-gift-us");
  assert.equal(product.fixed_packages[0].package_id, "fixture-gift-us<&>10");
  assert.deepEqual(product.variable_range, { min: 10, max: 200, step: 5, price_rate: 0.95 });
  assert.equal(product.supplier_quantity, null);
  assert.equal(product.supplier_quantity_known, false);
});

test("snapshot reuses shared freshness keys and never invents stock quantity", () => {
  const snapshot = buildBitrefillSnapshot(rawProduct, "fixture-gift-us<&>10", "2026-10-14T00:00:00.000Z");
  assert.equal(snapshot.available, true);
  assert.equal(snapshot.quantity, null);
  assert.equal(snapshot.supplier_quantity_known, false);
  assert.equal(snapshot.freshness.supplier_stock_stale, false);
  assert.equal(snapshot.freshness.supplier_stock_sync_status, "synced");
  assert.equal(Object.hasOwn(snapshot.freshness, "supplier_stock_synced_at"), true);
});

test("offline request uses frozen binding, fixed package and cost guard only", () => {
  const request = buildBitrefillInvoiceRequest({ items: [frozenItem] });
  assert.deepEqual(request, { products: [{ product_id: "fixture-gift-us", package_id: "fixture-gift-us<&>10", quantity: 1 }] });
  assert.equal("auto_pay" in request, false);
  assert.throws(() => buildBitrefillInvoiceRequest({ items: [{ ...frozenItem, binding: { ...frozenItem.binding, productId: "current-binding" } }] }), /FROZEN_BINDING_MISMATCH/);
  assert.throws(() => buildBitrefillInvoiceRequest({ items: [{ ...frozenItem, expectedCost: "10.01" }] }), /PURCHASE_COST_LIMIT/);
  assert.equal(assertBitrefillCostWithinLimit("10.00000000", "10"), true);
});

test("invoice item count is capped at 20 and oversized batches produce offline split plans", () => {
  const request = buildBitrefillInvoiceRequest({ items: [{ ...frozenItem, quantity: 20 }] });
  assert.equal(request.products[0].quantity, 20);
  assert.throws(() => buildBitrefillInvoiceRequest({ items: [{ ...frozenItem, quantity: 20 }, frozenItem] }), /INVOICE_ITEM_LIMIT/);
  const plan = planBitrefillInvoiceSplits({ items: [{ ...frozenItem, quantity: 20 }, { ...frozenItem, quantity: 1 }] });
  assert.equal(plan.length, 2);
  assert.equal(plan[0].products[0].quantity, 20);
  assert.equal(plan[1].products[0].quantity, 1);
});

test("invoice and order parsers cover pending/final states and fail closed", () => {
  assert.equal(normalizeBitrefillInvoice({ id: "inv-p", status: "payment_confirmed", orders: [] }).state, "PENDING");
  assert.equal(normalizeBitrefillInvoice({ id: "inv-d", status: "denied", orders: [] }).state, "FAILED");
  assert.equal(normalizeBitrefillInvoice({ id: "inv-b", status: "blocked", orders: [] }).state, "FAILED");
  assert.equal(normalizeBitrefillInvoice({ id: "inv-e", status: "payment_error", orders: [] }).state, "FAILED");
  assert.equal(normalizeBitrefillInvoice({ id: "inv-x", status: "future_state", orders: [] }).state, "UNKNOWN");
  assert.equal(normalizeBitrefillOrder({ id: "ord-1", status: "delivered", redemption_info: { code: "FIXTURE-CODE" } }).state, "SUCCEEDED");
  assert.equal(normalizeBitrefillOrder({ id: "ord-2", status: "processing" }).state, "PENDING");
  assert.equal(normalizeBitrefillOrder({ id: "ord-3", status: "failed" }).state, "FAILED");
  assert.equal(normalizeBitrefillOrder({ id: "ord-r", status: "refunded" }).state, "FAILED");
  assert.equal(normalizeBitrefillOrder({ id: "ord-4", status: "future_state" }).state, "UNKNOWN");
});

test("complete invoice with a failed order is partial, never all delivered", () => {
  const result = reconcileBitrefillInvoice({
    id: "inv-partial",
    status: "complete",
    orders: [
      { id: "ord-ok", status: "delivered", redemption_info: { code: "FIXTURE-CODE" } },
      { id: "ord-fail", status: "failed" },
      { id: "ord-pending", status: "processing" },
    ],
  });
  assert.equal(result.state, "RECONCILIATION_REQUIRED");
  assert.deepEqual(result.deliveryCandidates.map((order) => order.order_id), ["ord-ok"]);
  assert.deepEqual(result.failedOrderIds, ["ord-fail"]);
  assert.deepEqual(result.pendingOrderIds, ["ord-pending"]);
});

test("post-submit timeout is UNCERTAIN and never retryable", () => {
  assert.deepEqual(classifyBitrefillSubmitFailure({ submitted: true, code: "POST_SUBMIT_TIMEOUT" }), {
    state: "UNCERTAIN", retryPurchase: false, next: "RECONCILIATION_REQUIRED", code: "POST_SUBMIT_TIMEOUT",
  });
});

test("redemption parser emits private delivery shape and duplicate delivery is blocked", () => {
  const secret = normalizeBitrefillRedemption({ code: "FIXTURE-CODE", pin: "1234", link: "https://example.test/redeem", instructions: "fixture only", ignored: "no" });
  assert.deepEqual(secret, {
    storage: "digital_delivery_secrets",
    payload: { code: "FIXTURE-CODE", pin: "1234", url: "https://example.test/redeem", instructions: "fixture only" },
  });
  const guard = new BitrefillDeliveryDeduplicator();
  assert.equal(guard.claim("ord-1"), true);
  assert.equal(guard.claim("ord-1"), false);
});

test("observability metadata is allowlisted and cannot carry credentials or redemption", () => {
  const metadata = buildBitrefillLogMetadata({
    operation: "read_product", productId: "fixture-gift-us", invoiceId: "inv-1", orderId: "ord-1",
    status: "complete", latencyMs: 25, errorClass: "none",
    Authorization: "Bearer fixture-secret", redemption_info: { code: "FIXTURE-CODE" }, body: "ignored",
  });
  assert.deepEqual(metadata, {
    provider: "bitrefill", operation: "read_product", productId: "fixture-gift-us", invoiceId: "inv-1",
    orderId: "ord-1", status: "complete", errorClass: "none", latencyMs: 25,
  });
  assert.doesNotMatch(JSON.stringify(metadata), /fixture-secret|FIXTURE-CODE|Authorization|redemption|body/);
});

test("Business and Personal credentials have identical bounded catalog behavior", async () => {
  async function run(auth) {
    const seen = [];
    const client = createBitrefillClient({
      ...auth,
      maxRetries: 0,
      fetchImpl: async (url, init) => {
        seen.push({ url, scheme: init.headers.Authorization.split(" ")[0] });
        const start = new URL(url).searchParams.get("start");
        return new Response(JSON.stringify({
          data: start === "0" ? [{ id: "p-1", name: "P1", country: "US", currency: "USD", type: "gift_card", in_stock: true, packages: [] }] : [],
          meta: { start: Number(start), limit: 1, _next: start === "0" ? "ignored-untrusted-next" : null },
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });
    const result = await client.listProductsBounded({ pageSize: 1, maxPages: 2, maxProducts: 2 });
    return { result, seen };
  }
  const personal = await run({ authMode: "personal", apiKey: "fixture-key" });
  const business = await run({ authMode: "business", apiId: "fixture-id", apiSecret: "fixture-secret" });
  assert.deepEqual(personal.result.products, business.result.products);
  assert.equal(personal.seen.length, 2);
  assert.equal(business.seen.length, 2);
  assert.deepEqual(personal.seen.map((entry) => entry.scheme), ["Bearer", "Bearer"]);
  assert.deepEqual(business.seen.map((entry) => entry.scheme), ["Basic", "Basic"]);
});

test("bounded catalog honors a caller abort signal without network or retry", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const client = createBitrefillClient({
    authMode: "personal", apiKey: "fixture-key", maxRetries: 3,
    fetchImpl: async () => { calls += 1; throw new Error("must not fetch"); },
  });
  await assert.rejects(client.listProductsBounded({ signal: controller.signal }), (error) => error.code === "REQUEST_ABORTED");
  assert.equal(calls, 0);
});

test("provider refuses real createOrder but permits explicit fake-only simulation", async () => {
  const fake = new BitrefillFakeTransport({ invoice: { id: "fixture-invoice", status: "pending", orders: [] } });
  const provider = new BitrefillProvider(fake);
  const result = await provider.createOrder(buildBitrefillInvoiceRequest({ items: [frozenItem] }));
  assert.equal(result.id, "fixture-invoice");
  assert.equal(fake.invoiceSubmissions, 1);

  const http = new BitrefillProvider(new BitrefillHttpTransport({ authMode: "personal", apiKey: "fixture-key", fetchImpl: async () => { throw new Error("no network"); } }));
  await assert.rejects(http.createOrder({ products: [] }), /PURCHASE_DISABLED/);
});

test("missing and invalid rate headers remain unknown instead of affecting retries", () => {
  const headers = new Headers({ "x-ratelimit-limit": "invalid", "x-ratelimit-reset": "-1" });
  assert.deepEqual(parseBitrefillRateLimitHeaders(headers), {
    limit: null, remaining: null, reset: null, productQuotaRemaining: null, productQuotaNextWindow: null,
  });
});

test("webhook parser drops extra and redemption fields and rejects malicious identifiers", () => {
  const parsed = parseBitrefillWebhookEnvelope({
    id: "inv-safe_1",
    status: "complete",
    orders: [{ id: "ord-safe:1", status: "delivered", redemption_info: { code: "DO-NOT-RETAIN", pin: "0000" }, extra: "ignored" }],
    arbitrary: { secret: "ignored" },
  });
  assert.deepEqual(parsed, { invoiceId: "inv-safe_1", status: "complete", orders: [{ id: "ord-safe:1", status: "delivered" }] });
  assert.doesNotMatch(JSON.stringify(parsed), /DO-NOT-RETAIN|0000|arbitrary|extra/);
  assert.equal(parseBitrefillWebhookEnvelope({ id: "<script>alert(1)</script>", status: "complete", orders: [] }), null);
  assert.equal(parseBitrefillWebhookEnvelope({ id: "inv-1\r\nInjected: yes", status: "complete", orders: [] }), null);
});
