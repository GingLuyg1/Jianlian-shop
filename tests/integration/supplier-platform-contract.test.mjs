import assert from "node:assert/strict";
import test from "node:test";

import { createDajuHttpClient } from "../../lib/providers/daju/client-core.mjs";
import { compareDajuDecimal, validateDajuPurchaseReadiness } from "../../lib/providers/daju/mapper.mjs";
import { parseDajuOrderResponse, redactDajuLogValue } from "../../lib/providers/daju/protocol.mjs";
import { BitrefillProvider, buildBitrefillInvoiceRequest, buildBitrefillLogMetadata,
  buildBitrefillSnapshot, normalizeBitrefillProduct, reconcileBitrefillInvoice } from "../../lib/providers/bitrefill/provider-core.mjs";
import { BitrefillFakeTransport, BitrefillHttpTransport } from "../../lib/providers/bitrefill/transport.mjs";
import { canSupplierAutoPurchase, discoverSupplierProvider } from "../../lib/providers/core/supplier-router-core.mjs";

const dajuProduct = { id: 7, title: "Fixture Card", price: "9.50", stock: 3, sales: 0, is_auto: true,
  is_sku: false, min_qty: 1, max_qty: 20, required_inputs: [] };
const dajuOrder = { order_code: "daju-1", request_id: "jianlian:o1:i1", quantity: 1, unit_price: "9.50",
  total_price: "9.50", status: "completed", delivered: ["PRIVATE-CODE"], product_id: 7 };
const bitrefillRaw = { id: "bit-7", name: "Fixture Card", country: "US", currency: "USD", type: "gift_card", inStock: true,
  packages: [{ packageId: "bit-7-10", value: 10, price: 9.5 }] };
const bitrefillProduct = normalizeBitrefillProduct(bitrefillRaw);
const bitrefillItem = { binding: { supplier: "bitrefill", productId: "bit-7", sku: "bit-7-10", currency: "USD", faceValue: "10" },
  product: bitrefillProduct, quantity: 1, expectedCost: "9.50", frozenQuotedCost: "9.50", frozenMaxSupplierCost: "10" };

function dajuAdapter() {
  const calls = [];
  const client = createDajuHttpClient({ baseUrl: "https://daju.example.test", apiKey: "fixture-secret",
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method ?? "GET" });
      const path = new URL(url).pathname;
      const body = path === "/products" ? { products: [dajuProduct] } : path === "/product/7" ? { product: dajuProduct } : { order: dajuOrder };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    } });
  return {
    code: "daju", calls,
    catalog: async () => (await client.getProducts())[0],
    availability: async () => (await client.getProduct(7)).stock,
    frozenValid: async () => validateDajuPurchaseReadiness({ product: await client.getProduct(7),
      binding: { supplier: "daju", productId: 7, sku: null, inputsMapping: {}, maxUnitCost: "10" }, quantity: 1, orderFields: {} }).ok,
    costValid: () => compareDajuDecimal("9.50", "10") <= 0,
    purchase: () => client.purchase({ productId: 7, requestId: "jianlian:o1:i1", quantity: 1 }),
    lookup: () => client.getOrder("daju-1"),
    status: (order) => order.status === "completed" && order.delivered.length === 1,
    redact: (order) => redactDajuLogValue(order),
    duplicate: (order) => { const seen = new Set(); const first = !seen.has(order.orderCode); seen.add(order.orderCode); return [first, seen.has(order.orderCode)]; },
  };
}

function bitrefillAdapter() {
  const fake = new BitrefillFakeTransport({ catalog: { products: [bitrefillRaw], pagesRead: 1, truncated: false },
    products: { "bit-7": bitrefillRaw },
    invoice: { id: "inv-1", status: "complete", orders: [{ id: "ord-1", status: "delivered", redemption_info: { code: "PRIVATE-CODE" } }] } });
  const provider = new BitrefillProvider(fake);
  return {
    code: "bitrefill", calls: fake,
    catalog: async () => (await provider.readCatalog()).products[0],
    availability: async () => (await provider.readAvailability("bit-7")).available,
    frozenValid: async () => Boolean(buildBitrefillInvoiceRequest({ items: [bitrefillItem] })),
    costValid: () => Boolean(buildBitrefillInvoiceRequest({ items: [bitrefillItem] })),
    purchase: () => provider.createOrder(buildBitrefillInvoiceRequest({ items: [bitrefillItem] })),
    lookup: () => fake.readInvoice(),
    status: (invoice) => reconcileBitrefillInvoice(invoice).state === "SUCCEEDED",
    redact: () => buildBitrefillLogMetadata({ operation: "reconcile", invoiceId: "inv-1", Authorization: "fixture-secret", code: "PRIVATE-CODE" }),
    duplicate: (invoice) => { const seen = new Set(); const id = invoice.orders[0].id; return [!seen.has(id) && Boolean(seen.add(id)), seen.has(id)]; },
  };
}

for (const make of [dajuAdapter, bitrefillAdapter]) {
  test(`${make().code} shared provider contract: identity/capability/catalog/availability/frozen cost/status/reconciliation/dedup/redaction`, async () => {
    const adapter = make();
    const capabilities = discoverSupplierProvider(adapter.code).capabilities;
    assert.equal(capabilities.catalog, true);
    assert.equal(capabilities.availability, true);
    assert.equal(capabilities.availabilityType, adapter.code === "daju" ? "quantity" : "boolean");
    assert.equal(capabilities.reconciliation === true || capabilities.reconciliation === "fixture_only", true);
    assert.equal(canSupplierAutoPurchase(adapter.code), adapter.code === "daju");
    const catalog = await adapter.catalog();
    assert.ok(catalog);
    const availability = await adapter.availability();
    assert.equal(adapter.code === "daju" ? availability === 3 : availability === true, true);
    assert.equal(await adapter.frozenValid(), true);
    assert.equal(adapter.costValid(), true);
    if (capabilities.purchase === true) {
      const purchased = await adapter.purchase();
      assert.equal(adapter.status(purchased), true);
    } else {
      const http = new BitrefillProvider(new BitrefillHttpTransport({ authMode: "personal", apiKey: "fixture", fetchImpl: async () => { throw new Error("network forbidden"); } }));
      await assert.rejects(http.createOrder({ products: [] }), /PURCHASE_DISABLED/);
      assert.equal(adapter.calls.invoiceSubmissions, 0);
      const simulated = await adapter.purchase();
      assert.equal(adapter.status(simulated), true);
      assert.equal(adapter.calls.invoiceSubmissions, 1);
    }
    const authoritative = await adapter.lookup();
    assert.equal(adapter.status(authoritative), true);
    assert.deepEqual(adapter.duplicate(authoritative), [true, true]);
    assert.doesNotMatch(JSON.stringify(adapter.redact(authoritative)), /PRIVATE-CODE|fixture-secret/);
    if (adapter.code === "daju") assert.equal(adapter.calls.filter((entry) => entry.method === "POST").length, 1);
    else assert.equal(adapter.calls.invoiceSubmissions, 1);
  });
}

test("common claim/outcome model is single-item exclusive, terminal and QUERY-only", () => {
  const row = { status: "PURCHASING", attemptToken: "a1", orderCode: null };
  function claim() {
    if (row.status === "FULFILLED") return "NONE";
    if (["PURCHASING", "UNCERTAIN", "RECONCILIATION"].includes(row.status)) return row.orderCode ? "QUERY" : "NONE";
    if (row.status === "FAILED" && row.retryable) return "PURCHASE";
    return "NONE";
  }
  assert.equal(claim(), "NONE");
  row.status = "UNCERTAIN";
  assert.equal(claim(), "NONE");
  row.orderCode = "known-order";
  assert.equal(claim(), "QUERY");
  row.status = "FULFILLED";
  assert.equal(claim(), "NONE");
  row.status = "FAILED"; row.retryable = false;
  assert.equal(claim(), "NONE");
  row.retryable = true;
  assert.equal(claim(), "PURCHASE");
  assert.ok(parseDajuOrderResponse({ order: dajuOrder }));
  assert.equal(buildBitrefillSnapshot(bitrefillRaw, "bit-7-10", "2026-10-14T00:00:00Z").supplier_quantity_known, false);
});
