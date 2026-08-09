import assert from "node:assert/strict";
import test from "node:test";

import { createDajuHttpClient, DajuClientCoreError } from "../../lib/providers/daju/client-core.mjs";
import { classifyDajuFulfillmentCandidate } from "../../lib/providers/daju/fulfillment-candidate.mjs";
import { fulfillDajuCandidates } from "../../lib/providers/daju/fulfillment-core.mjs";
import {
  compareDajuDecimal,
  mapDajuRequiredInputs,
  parseDajuProductBinding,
  validateDajuPurchaseReadiness,
} from "../../lib/providers/daju/mapper.mjs";
import {
  createDajuRequestId,
  parseDajuBalanceResponse,
  parseDajuOrderResponse,
  parseDajuProductDetailResponse,
  parseDajuProductsResponse,
  redactDajuLogValue,
} from "../../lib/providers/daju/protocol.mjs";

const product = {
  id: 11, title: "AI membership", price: "8.50", stock: 9, sales: 2,
  is_auto: true, is_sku: true, cover: null, sort_id: 1, description: "detail",
  min_qty: 1, max_qty: 5, specs: [], sku_variants: [], required_inputs: ["email"],
};

const order = {
  order_code: "DJ-1", request_id: "jianlian:order-1:item-1", quantity: 2,
  unit_price: "8.50", total_price: "17.00", balance_after: "30.00",
  status: "completed", delivered: ["CARD-A", "CARD-B"], duplicate: false,
};

function orderItem(supplierBinding, overrides = {}) {
  return {
    id: "item-1",
    order_id: "order-1",
    product_id: "product-1",
    sku_id: null,
    quantity: 1,
    delivery_type: "automatic",
    product_snapshot: supplierBinding === undefined ? { id: "product-1" } : { supplier_binding: supplierBinding },
    ...overrides,
  };
}

test("order snapshot is the sole supplier routing authority after checkout", () => {
  const frozen = {
    fulfillment_source: "supplier",
    supplier: "daju",
    supplier_product_id: 11,
    supplier_sku: "SNAPSHOT-SKU",
    supplier_inputs_mapping: { email: "customer_email" },
    supplier_max_unit_cost: "8.50",
  };

  const supplier = classifyDajuFulfillmentCandidate(orderItem(frozen, {
    current_product_metadata: { fulfillment_source: "local" },
  }));
  assert.equal(supplier.kind, "daju");
  assert.equal(supplier.binding.productId, 11);
  assert.equal(supplier.binding.sku, "SNAPSHOT-SKU");
  assert.deepEqual(supplier.binding.inputsMapping, { email: "customer_email" });
  assert.equal(supplier.binding.maxUnitCost, "8.50");

  assert.deepEqual(classifyDajuFulfillmentCandidate(orderItem(undefined, {
    current_product_metadata: frozen,
  })), { kind: "skip", reason: "LEGACY_LOCAL" });
  assert.deepEqual(classifyDajuFulfillmentCandidate(orderItem({ ...frozen, supplier: "other" }, {
    current_product_metadata: frozen,
  })), { kind: "skip", reason: "OTHER_SUPPLIER" });
});

test("malformed Daju snapshots require validation without catalog fallback", () => {
  assert.deepEqual(
    classifyDajuFulfillmentCandidate(orderItem({ fulfillment_source: "supplier", supplier: "daju" })),
    { kind: "validation", reason: "SUPPLIER_BINDING_INVALID", binding: null }
  );
  assert.deepEqual(
    classifyDajuFulfillmentCandidate(orderItem("malformed-binding")),
    { kind: "validation", reason: "SUPPLIER_BINDING_INVALID", binding: null }
  );
});

test("SKU and no-SKU supplier items both use their frozen snapshot binding", () => {
  const noSku = classifyDajuFulfillmentCandidate(orderItem({
    fulfillment_source: "supplier", supplier: "daju", supplier_product_id: 11,
  }));
  const withSku = classifyDajuFulfillmentCandidate(orderItem({
    fulfillment_source: "supplier", supplier: "daju", supplier_product_id: 12, supplier_sku: "SKU-PRO",
  }, { sku_id: "sku-1" }));
  assert.equal(noSku.kind, "daju");
  assert.equal(noSku.binding.productId, 11);
  assert.equal(noSku.binding.sku, null);
  assert.equal(withSku.kind, "daju");
  assert.equal(withSku.binding.productId, 12);
  assert.equal(withSku.binding.sku, "SKU-PRO");
});

test("local digital items remain outside Daju routing", () => {
  assert.deepEqual(classifyDajuFulfillmentCandidate(orderItem(null)), { kind: "skip", reason: "LEGACY_LOCAL" });
  assert.deepEqual(
    classifyDajuFulfillmentCandidate(orderItem(undefined, { delivery_type: "manual_delivery" })),
    { kind: "skip", reason: "NOT_AUTOMATIC" }
  );
});

test("strictly parses product list, SKU detail, required inputs and balance", () => {
  assert.equal(parseDajuProductsResponse({ products: [product] })?.[0].id, 11);
  assert.deepEqual(parseDajuProductDetailResponse({ product })?.requiredInputs, ["email"]);
  assert.deepEqual(parseDajuBalanceResponse({ balance: { balance: "47.50", name: "seller", total_spent: "2.50", total_orders: 3 } }), {
    balance: "47.50", name: "seller", totalSpent: "2.50", totalOrders: 3,
  });
  assert.deepEqual(parseDajuBalanceResponse({ balance: "47.50", name: "seller", total_spent: "2.50", total_orders: 3 }), {
    balance: "47.50", name: "seller", totalSpent: "2.50", totalOrders: 3,
  });
  assert.equal(parseDajuProductsResponse({ products: [{ ...product, stock: "9" }] }), null);
});

test("accepts the real product-detail max_qty zero sentinel without weakening other quantity validation", () => {
  const realDetailShape = {
    ...product,
    max_qty: 0,
    specs: [{ name: "duration", values: ["monthly"] }],
    sku_variants: [{ id: 1, title: "monthly" }],
    required_inputs: [],
  };
  assert.equal(parseDajuProductDetailResponse({ success: true, product: realDetailShape })?.maxQty, 0);
  assert.equal(parseDajuProductDetailResponse({ product: { ...realDetailShape, max_qty: -1 } }), null);
  assert.equal(parseDajuProductDetailResponse({ product: { ...realDetailShape, max_qty: 0.5 } }), null);
});

test("treats max_qty zero as no positive purchase ceiling while preserving all other readiness gates", () => {
  const binding = parseDajuProductBinding({
    fulfillment_source: "supplier",
    supplier: "daju",
    supplier_product_id: 45,
    supplier_sku: null,
    supplier_inputs_mapping: {},
    supplier_max_unit_cost: "7",
  });
  const unlimited = parseDajuProductDetailResponse({
    product: {
      ...product,
      id: 45,
      price: "6.5",
      stock: 96,
      is_sku: false,
      min_qty: 1,
      max_qty: 0,
      required_inputs: [],
    },
  });
  assert.ok(binding);
  assert.ok(unlimited);
  assert.deepEqual(validateDajuPurchaseReadiness({
    product: unlimited,
    binding,
    quantity: 1,
    orderFields: {},
  }), { ok: true, inputs: {} });
  assert.deepEqual(validateDajuPurchaseReadiness({
    product: unlimited,
    binding,
    quantity: 2,
    orderFields: {},
  }), { ok: true, inputs: {} });

  const capped = parseDajuProductDetailResponse({
    product: { ...product, id: 45, price: "6.5", stock: 96, min_qty: 1, max_qty: 5, required_inputs: [] },
  });
  assert.equal(validateDajuPurchaseReadiness({
    product: capped,
    binding,
    quantity: 6,
    orderFields: {},
  }).code, "FAILED_VALIDATION");

  const minimumTwo = parseDajuProductDetailResponse({
    product: { ...product, id: 45, price: "6.5", stock: 96, min_qty: 2, max_qty: 0, required_inputs: [] },
  });
  assert.equal(validateDajuPurchaseReadiness({
    product: minimumTwo,
    binding,
    quantity: 1,
    orderFields: {},
  }).code, "FAILED_VALIDATION");
});

test("strictly parses fulfilled purchases with multiple delivery secrets", () => {
  const parsed = parseDajuOrderResponse(order);
  assert.deepEqual(parsed?.delivered, ["CARD-A", "CARD-B"]);
  assert.equal(parseDajuOrderResponse({ ...order, delivered: [{ code: "CARD-A" }] }), null);
  assert.deepEqual(redactDajuLogValue(parsed), { code: null, status: "completed", hasOrderCode: true, deliveredCount: 2 });
  assert.doesNotMatch(JSON.stringify(redactDajuLogValue(parsed)), /CARD-A|CARD-B/);
});

test("validates metadata binding, required inputs and exact cost ceiling", () => {
  const binding = parseDajuProductBinding({
    fulfillment_source: "supplier", supplier: "daju", supplier_product_id: 11,
    supplier_sku: "PRO", supplier_inputs_mapping: { email: "customer_email" },
    supplier_max_unit_cost: "8.50",
  });
  assert.ok(binding);
  assert.equal(compareDajuDecimal("8.500", "8.50"), 0);
  assert.deepEqual(mapDajuRequiredInputs(["email"], binding.inputsMapping, { customer_email: "u@example.test" }), {
    ok: true, inputs: { email: "u@example.test" },
  });
  assert.equal(validateDajuPurchaseReadiness({
    product: parseDajuProductDetailResponse({ product }), binding, quantity: 2,
    orderFields: { customer_email: "u@example.test" },
  }).ok, true);
  assert.equal(validateDajuPurchaseReadiness({
    product: parseDajuProductDetailResponse({ product: { ...product, price: "8.51" } }), binding, quantity: 2,
    orderFields: { customer_email: "u@example.test" },
  }).code, "COST_LIMIT_EXCEEDED");
  assert.equal(validateDajuPurchaseReadiness({
    product: parseDajuProductDetailResponse({ product }), binding: { ...binding, maxUnitCost: null }, quantity: 2,
    orderFields: { customer_email: "u@example.test" },
  }).code, "COST_LIMIT_UNCONFIGURED");
  assert.equal(validateDajuPurchaseReadiness({
    product: parseDajuProductDetailResponse({ product }), binding, quantity: 2, orderFields: {},
  }).code, "NEEDS_INPUT");
});

test("HTTP client sends API key in the header and parses list/detail/balance", async () => {
  const calls = [];
  const responses = [
    { products: [product] }, { product },
    { balance: { balance: "47.50", name: "seller", total_spent: "2.50", total_orders: 3 } },
  ];
  const client = createDajuHttpClient({
    baseUrl: "https://supplier.example/api.php", apiKey: "test-placeholder-not-a-real-key",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), key: init.headers["X-API-Key"] });
      return new Response(JSON.stringify(responses.shift()), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  assert.equal((await client.getProducts("AI"))[0].id, 11);
  assert.equal((await client.getProduct(11)).isSku, true);
  assert.equal((await client.getBalance()).balance, "47.50");
  assert.match(calls[0].url, /api\.php\/products\?q=AI$/);
  assert.ok(calls.every((call) => call.key === "test-placeholder-not-a-real-key"));
});

test("purchase preserves the caller request id and can query the returned order", async () => {
  const bodies = [];
  const client = createDajuHttpClient({
    baseUrl: "https://supplier.example/api.php", apiKey: "placeholder",
    fetchImpl: async (url, init) => {
      if (init.body) bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ order }), { status: 200 });
    },
  });
  assert.deepEqual((await client.purchase({ productId: 11, requestId: order.request_id, quantity: 2, sku: "PRO", inputs: { email: "u@example.test" } })).delivered, ["CARD-A", "CARD-B"]);
  assert.equal((await client.getOrder("DJ-1")).orderCode, "DJ-1");
  assert.equal(bodies[0].request_id, order.request_id);
});

test("HTTP 429 and timeout are explicit safe failures without response bodies", async () => {
  const limited = createDajuHttpClient({
    baseUrl: "https://supplier.example/api.php", apiKey: "placeholder",
    fetchImpl: async () => new Response(JSON.stringify({ code: "RATE_LIMITED", message: "internal detail" }), { status: 429 }),
  });
  await assert.rejects(() => limited.getBalance(), (error) => error instanceof DajuClientCoreError && error.code === "RATE_LIMITED" && !error.message.includes("internal detail"));

  const timeout = createDajuHttpClient({
    baseUrl: "https://supplier.example/api.php", apiKey: "placeholder", timeoutMs: 5,
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))),
  });
  await assert.rejects(() => timeout.getBalance(), (error) => error.code === "UPSTREAM_TIMEOUT");
});

test("HTTP 200 REQUEST_PROCESSING is classified as a supplier state, not malformed success", async () => {
  const client = createDajuHttpClient({
    baseUrl: "https://supplier.example/api.php", apiKey: "placeholder",
    fetchImpl: async () => new Response(JSON.stringify({ code: "REQUEST_PROCESSING", message: "not for logs" }), { status: 200 }),
  });
  await assert.rejects(
    () => client.purchase({ productId: 11, requestId: order.request_id, quantity: 1 }),
    (error) => error.code === "REQUEST_PROCESSING" && !error.message.includes("not for logs")
  );
});

function baseCandidate() {
  return {
    orderId: "order-1", orderItemId: "item-1", quantity: 2, bindingInvalid: false,
    binding: { supplier: "daju", productId: 11, sku: null, inputsMapping: { email: "customer_email" }, maxUnitCost: "8.50" },
    orderFields: { customer_email: "u@example.test" },
  };
}

function runtime(overrides = {}) {
  const outcomes = [];
  const purchases = [];
  const store = {
    claim: async (_candidate, requestId) => ({ action: "PURCHASE", requestId, attemptToken: "attempt-1", status: "PURCHASING", orderCode: null }),
    recordOutcome: async (value) => outcomes.push(value),
  };
  const client = {
    getProduct: async () => parseDajuProductDetailResponse({ product }),
    purchase: async (value) => { purchases.push(value); return parseDajuOrderResponse(order); },
    getOrder: async () => parseDajuOrderResponse(order),
  };
  return { store: { ...store, ...overrides.store }, client: { ...client, ...overrides.client }, outcomes, purchases };
}

function coreInput(ctx) {
  return {
    candidates: [baseCandidate()], store: ctx.store, client: ctx.client, triggerSource: "test",
    createRequestId: createDajuRequestId,
    validateReadiness: validateDajuPurchaseReadiness,
    outcome: (candidate, claim, requestId, state, retryable, code, extra = {}) => ({ candidate, claim, requestId, state, retryable, code, ...extra }),
  };
}

test("fulfilled workflow stores all secrets once and reuses the stable request id", async () => {
  const ctx = runtime();
  const result = await fulfillDajuCandidates(coreInput(ctx));
  assert.deepEqual(result, { handled: 1, fulfilled: 1, failed: 0, uncertain: 0, needsInput: 0 });
  assert.equal(ctx.purchases[0].requestId, "jianlian:order-1:item-1");
  assert.equal(ctx.outcomes[0].deliveredContent, "CARD-A\nCARD-B");
});

test("invalid frozen binding never reaches supplier purchase", async () => {
  const ctx = runtime();
  const candidate = { ...baseCandidate(), binding: null, bindingInvalid: true };
  const result = await fulfillDajuCandidates({ ...coreInput(ctx), candidates: [candidate] });
  assert.equal(result.failed, 1);
  assert.equal(ctx.purchases.length, 0);
  assert.equal(ctx.outcomes[0].state, "FAILED_VALIDATION");
  assert.equal(ctx.outcomes[0].code, "SUPPLIER_BINDING_INVALID");
});

test("purchase without delivered queries order once", async () => {
  let queries = 0;
  const pending = parseDajuOrderResponse({ ...order, delivered: [] });
  const ctx = runtime({ client: { purchase: async () => pending, getOrder: async () => { queries += 1; return parseDajuOrderResponse(order); } } });
  const result = await fulfillDajuCandidates(coreInput(ctx));
  assert.equal(result.fulfilled, 1);
  assert.equal(queries, 1);
});

test("duplicate fulfilled response is accepted without changing the request id", async () => {
  const ctx = runtime({ client: { purchase: async (value) => { ctx.purchases.push(value); return parseDajuOrderResponse({ ...order, duplicate: true }); } } });
  const result = await fulfillDajuCandidates(coreInput(ctx));
  assert.equal(result.fulfilled, 1);
  assert.equal(ctx.outcomes[0].requestId, "jianlian:order-1:item-1");
});

test("REQUEST_PROCESSING, idempotency unavailable and transport timeout become uncertain without a new purchase", async () => {
  for (const error of [
    Object.assign(new Error("processing"), { code: "REQUEST_PROCESSING", kind: "http" }),
    Object.assign(new Error("idempotency"), { code: "IDEMPOTENCY_UNAVAILABLE", kind: "http" }),
    Object.assign(new Error("timeout"), { code: "UPSTREAM_TIMEOUT", kind: "timeout" }),
    Object.assign(new Error("upstream"), { code: "UPSTREAM_UNAVAILABLE", kind: "http" }),
  ]) {
    const ctx = runtime({ client: { purchase: async (value) => { ctx.purchases.push(value); throw error; } } });
    const result = await fulfillDajuCandidates(coreInput(ctx));
    assert.equal(result.uncertain, 1);
    assert.equal(ctx.purchases.length, 1);
    assert.equal(ctx.purchases[0].requestId, "jianlian:order-1:item-1");
    assert.equal(ctx.outcomes[0].state, "UNCERTAIN");
  }
});

test("rate limit is retryable with the same request while balance and stock failures are terminal", async () => {
  for (const [code, state, retryable] of [
    ["RATE_LIMITED", "PENDING", true],
    ["INSUFFICIENT_BALANCE", "FAILED", false],
    ["OUT_OF_STOCK", "FAILED", false],
    ["PRODUCT_NOT_FOUND", "FAILED", false],
  ]) {
    const ctx = runtime({ client: { purchase: async () => { throw Object.assign(new Error(code), { code, kind: "http" }); } } });
    await fulfillDajuCandidates(coreInput(ctx));
    assert.equal(ctx.outcomes[0].requestId, "jianlian:order-1:item-1");
    assert.equal(ctx.outcomes[0].state, state);
    assert.equal(ctx.outcomes[0].retryable, retryable);
  }
});

test("an already fulfilled claim never calls purchase again", async () => {
  let purchases = 0;
  const ctx = runtime({
    store: { claim: async (_candidate, requestId) => ({ action: "NONE", requestId, attemptToken: null, status: "FULFILLED", orderCode: "DJ-1" }) },
    client: { purchase: async () => { purchases += 1; return parseDajuOrderResponse(order); } },
  });
  const result = await fulfillDajuCandidates(coreInput(ctx));
  assert.equal(result.fulfilled, 1);
  assert.equal(purchases, 0);
  assert.equal(ctx.outcomes.length, 0);
});
