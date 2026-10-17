import assert from "node:assert/strict";
import test from "node:test";

import { createBitrefillClient } from "../../lib/providers/bitrefill/client-core.mjs";
import {
  buildBitrefillInvoiceRequest, buildBitrefillSnapshot, evaluateBitrefillSnapshotAvailability,
  classifyBitrefillSubmitFailure, normalizeBitrefillProduct, normalizeBitrefillRedemption, planBitrefillInvoiceGroups,
  reconcileBitrefillInvoiceGroups,
} from "../../lib/providers/bitrefill/provider-core.mjs";
import {
  createBitrefillWebhookIdempotencyKey, parseBitrefillProduct,
  parseBitrefillProductsResponse, parseBitrefillWebhookEnvelope, redactBitrefillLogValue,
} from "../../lib/providers/bitrefill/protocol.mjs";
import { readBitrefillWebhookBody } from "../../lib/providers/bitrefill/webhook-body.mjs";

const raw = { id: "apple-us", name: "Apple US", country: "US", currency: "USD", type: "gift_card", inStock: true,
  packages: [{ packageId: "apple-10", value: 10, price: 9.5 }] };
const product = normalizeBitrefillProduct(raw);
function item(orderItemId, quantity = 1) {
  return { orderItemId, binding: { supplier: "bitrefill", productId: "apple-us", sku: "apple-10", currency: "USD", faceValue: "10" },
    product, quantity, expectedCost: "9.50", frozenQuotedCost: "9.50", frozenMaxSupplierCost: "10.00" };
}

test("offline quote and frozen identity reject missing cost, numbers, currency, face and package drift", () => {
  const base = item("i1");
  const variants = [
    [{ ...base, expectedCost: undefined }, /COST_INVALID/],
    [{ ...base, expectedCost: 9.5 }, /COST_INVALID/],
    [{ ...base, expectedCost: "9.501" }, /QUOTE_DRIFT/],
    [{ ...base, frozenQuotedCost: "9.49" }, /QUOTE_DRIFT/],
    [{ ...base, expectedCost: "10.01", frozenQuotedCost: "10.01" }, /PURCHASE_COST_LIMIT/],
    [{ ...base, binding: { ...base.binding, currency: "EUR" } }, /CURRENCY_MISMATCH/],
    [{ ...base, binding: { ...base.binding, faceValue: "25" } }, /PACKAGE_VALUE_DRIFT/],
    [{ ...base, binding: { ...base.binding, sku: "apple-25" } }, /PACKAGE_NOT_FOUND/],
    [{ ...base, product: { ...product, external_product_id: "other" } }, /FROZEN_BINDING_MISMATCH/],
  ];
  for (const [variant, code] of variants) assert.throws(() => buildBitrefillInvoiceRequest({ items: [variant] }), code);
  assert.deepEqual(buildBitrefillInvoiceRequest({ items: [base] }).products, [{ product_id: "apple-us", package_id: "apple-10", quantity: 1 }]);
});

test("20/21/40/41 units preserve order item and unit slice in pure invoice groups", () => {
  for (const count of [20, 21, 40, 41]) {
    const groups = planBitrefillInvoiceGroups({ items: Array.from({ length: count }, (_, index) => item(`item-${index}`)) });
    assert.equal(groups.length, Math.ceil(count / 20));
    assert.deepEqual(groups.map((group) => group.allocations.length),
      Array.from({ length: Math.ceil(count / 20) }, (_, index) => Math.min(20, count - index * 20)));
    assert.deepEqual(groups.flatMap((group) => group.allocations.map((entry) => entry.orderItemId)),
      Array.from({ length: count }, (_, index) => `item-${index}`));
    assert.equal(groups.every((group) => group.request.products.reduce((sum, entry) => sum + entry.quantity, 0) <= 20), true);
  }
  const split = planBitrefillInvoiceGroups({ items: [item("one", 20), item("two", 20), item("three", 1)] });
  assert.deepEqual(split.map((group) => group.allocations.map((entry) => entry.orderItemId)[0]), ["one", "two", "three"]);
  assert.throws(() => planBitrefillInvoiceGroups({ items: [item("same"), item("same")] }), /ORDER_ITEM_DUPLICATE/);
});

test("multi-invoice partial delivery credits only explicitly bound completed units", () => {
  const groups = planBitrefillInvoiceGroups({ items: Array.from({ length: 21 }, (_, index) => item(`i${index}`)) });
  const bindings = Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`o${index}`, { orderItemId: `i${index}`, unitIndex: 0 }]));
  const first = { id: "inv0", status: "complete", orders: Array.from({ length: 20 }, (_, index) => ({ id: `o${index}`, status: "delivered", redemption_info: { code: `C${index}` } })) };
  const second = { id: "inv1", status: "complete", orders: [{ id: "o20", status: "failed" }] };
  const states = reconcileBitrefillInvoiceGroups(groups, [first, second], bindings);
  assert.equal(states.i0.state, "SUCCEEDED");
  assert.equal(states.i20.state, "RECONCILIATION_REQUIRED");
  assert.equal(states.i0.deliveredOrderIds.length, 1);
  const replay = reconcileBitrefillInvoiceGroups(groups, [first, second], { ...bindings, o1: bindings.o0 });
  assert.equal(replay.i1.state, "RECONCILIATION_REQUIRED");
});

test("stale, failed and future snapshots cannot authorize purchase", () => {
  const snap = buildBitrefillSnapshot(raw, "apple-10", "2026-10-14T00:00:00.000Z");
  const now = Date.parse("2026-10-14T00:30:00.000Z");
  assert.deepEqual(evaluateBitrefillSnapshotAvailability(snap, now, 3_600_000), { state: "available", purchasable: true });
  assert.equal(evaluateBitrefillSnapshotAvailability(snap, now + 3_600_001, 3_600_000).purchasable, false);
  assert.equal(evaluateBitrefillSnapshotAvailability({ ...snap, error_state: "503" }, now, 3_600_000).purchasable, false);
  assert.equal(evaluateBitrefillSnapshotAvailability({ ...snap, checked_at: "2030-01-01" }, now, 3_600_000).purchasable, false);
});

test("catalog and webhook reject oversized or malformed fields without substitution", () => {
  const wire = { id: "apple-us", name: "Apple US", country: "US", currency: "USD", in_stock: true,
    packages: [{ id: "apple-10", value: "10", price: 9.5 }] };
  assert.equal(parseBitrefillProduct(wire).id, "apple-us");
  assert.equal(parseBitrefillProductsResponse({ data: Array(51).fill(wire) }), null);
  assert.equal(parseBitrefillProduct({ ...wire, currency: "usd" }), null);
  assert.equal(parseBitrefillProduct({ ...wire, name: "<script>" }), null);
  assert.equal(parseBitrefillProduct({ ...wire, packages: Array(201).fill(wire.packages[0]) }), null);
  assert.equal(parseBitrefillProduct({ ...wire, packages: [{ ...wire.packages[0], price: "NaN" }] }), null);
  assert.equal(parseBitrefillProduct({ ...wire, packages: [{ ...wire.packages[0], value: "10<script>" }] }), null);
  assert.equal(normalizeBitrefillRedemption({ link: "http://localhost/admin" }), null);
  assert.equal(normalizeBitrefillRedemption({ url: "https://evil.test@localhost/" }), null);
  assert.equal(normalizeBitrefillRedemption({ url: "https://127.0.0.1/admin" }), null);
  const webhook = { id: "inv1", status: "complete", orders: [{ id: "ord1", status: "delivered", redemption_info: { code: "SECRET" } }] };
  const parsed = parseBitrefillWebhookEnvelope(webhook);
  assert.deepEqual(parsed, { invoiceId: "inv1", status: "complete", orders: [{ id: "ord1", status: "delivered" }] });
  assert.equal(createBitrefillWebhookIdempotencyKey(parsed), createBitrefillWebhookIdempotencyKey(parseBitrefillWebhookEnvelope(webhook)));
  assert.doesNotMatch(JSON.stringify(redactBitrefillLogValue({ Authorization: "TOKEN", redemption_info: { code: "SECRET" } })), /TOKEN|SECRET/);
});

test("webhook body enforces streaming 64 KiB, timeout, JSON and nested complexity", async () => {
  const request = (body) => new Request("https://example.test/hook", { method: "POST", body, headers: { "content-type": "application/json" } });
  assert.equal((await readBitrefillWebhookBody(request('{"id":"inv1"}'))).ok, true);
  assert.deepEqual(await readBitrefillWebhookBody(request("{")), { ok: false, status: 400, error: "invalid_json" });
  assert.deepEqual(await readBitrefillWebhookBody(request("x".repeat(65_537))), { ok: false, status: 413, error: "payload_too_large" });
  assert.deepEqual(await readBitrefillWebhookBody(request(JSON.stringify({ deep: Array(14).fill(0).reduce((v) => [v], 0) }))),
    { ok: false, status: 400, error: "invalid_webhook" });
  const slow = new ReadableStream({ pull: () => new Promise(() => {}) });
  const timed = new Request("https://example.test/hook", { method: "POST", body: slow, duplex: "half" });
  assert.deepEqual(await readBitrefillWebhookBody(timed, { timeoutMs: 10 }), { ok: false, status: 408, error: "body_timeout" });
});

test("GET failure matrix has bounded retry; purchase POST remains disabled", async () => {
  for (const [status, expectedCalls] of [[429, 2], [503, 2], [500, 1], [401, 1]]) {
    let calls = 0;
    const client = createBitrefillClient({ authMode: "personal", apiKey: "fixture", maxRetries: 1, sleep: async () => {},
      fetchImpl: async () => { calls += 1; return new Response('{}', { status }); } });
    await assert.rejects(client.ping());
    assert.equal(calls, expectedCalls);
  }
  let transportCalls = 0;
  const client = createBitrefillClient({ authMode: "personal", apiKey: "fixture", maxRetries: 1, sleep: async () => {},
    fetchImpl: async () => { transportCalls += 1; throw new TypeError("offline"); } });
  await assert.rejects(client.ping(), (error) => error.kind === "transport");
  assert.equal(transportCalls, 2);
});

test("GET timeout retries finitely; future POST timeout is never automatically retried", async () => {
  let calls = 0;
  const client = createBitrefillClient({ authMode: "personal", apiKey: "fixture", timeoutMs: 5, maxRetries: 1,
    sleep: async () => {}, fetchImpl: (_url, init) => new Promise((_resolve, reject) => {
      calls += 1;
      init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
    }) });
  await assert.rejects(client.ping(), (error) => error.kind === "transport" && error.code === "UPSTREAM_UNAVAILABLE");
  assert.equal(calls, 2);
  for (const error of [{ submitted: true }, { code: "POST_SUBMIT_TIMEOUT" }]) {
    assert.deepEqual(classifyBitrefillSubmitFailure(error), {
      state: "UNCERTAIN", retryPurchase: false, next: "RECONCILIATION_REQUIRED", code: "POST_SUBMIT_TIMEOUT",
    });
  }
  assert.equal(classifyBitrefillSubmitFailure({ submitted: false }).retryPurchase, false);
});
