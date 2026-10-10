import assert from "node:assert/strict";
import test from "node:test";

import {
  BitrefillClient,
  BitrefillClientError,
  buildBitrefillAuthorization,
  createBitrefillClient,
} from "../../lib/providers/bitrefill/client-core.mjs";
import {
  createBitrefillWebhookIdempotencyKey,
  evaluateBitrefillInvoiceOutcome,
  mapBitrefillAvailability,
  parseBitrefillProduct,
  parseBitrefillProductsResponse,
  parseBitrefillWebhookEnvelope,
  redactBitrefillLogValue,
} from "../../lib/providers/bitrefill/protocol.mjs";

const fixedProduct = {
  id: "amazon-us",
  name: "Amazon US",
  country_code: "US",
  currency: "USD",
  type: "gift_card",
  in_stock: true,
  packages: [
    { package_id: "amazon-us<&>25", value: 25, price: 25 },
    { id: "amazon-us<&>50", value: 50, price: 50 },
  ],
};

const rangeProduct = {
  id: "steam-us",
  name: "Steam US",
  country: "US",
  currency: "USD",
  type: "gift_card",
  in_stock: false,
  packages: [],
  range: { min: 10, max: 200, step: 5, price_rate: 1.01 },
};

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

test("Personal and Business auth modes only build the documented Authorization value", () => {
  assert.equal(buildBitrefillAuthorization({ authMode: "personal", apiKey: "fixture-personal-key" }), "Bearer fixture-personal-key");
  assert.equal(
    buildBitrefillAuthorization({ authMode: "business", apiId: "fixture-id", apiSecret: "fixture-secret" }),
    `Basic ${Buffer.from("fixture-id:fixture-secret").toString("base64")}`,
  );
  assert.throws(() => buildBitrefillAuthorization({ authMode: "other" }), /BITREFILL_AUTH_MODE_INVALID/);
});

test("BitrefillClient exposes the same read-only surface without purchase methods", () => {
  const client = new BitrefillClient({ authMode: "personal", apiKey: "fixture-key", fetchImpl: async () => jsonResponse({ message: "pong" }) });
  assert.equal(typeof client.ping, "function");
  assert.equal(typeof client.listProducts, "function");
  assert.equal("purchase" in client, false);
});

test("read-only client sends credentials in a header, never in the URL or error", async () => {
  const seen = [];
  const client = createBitrefillClient({
    authMode: "personal",
    apiKey: "fixture-personal-key",
    maxRetries: 0,
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      return jsonResponse({ message: "pong" });
    },
  });
  assert.equal((await client.ping()).message, "pong");
  assert.equal(seen[0].init.method, "GET");
  assert.equal(seen[0].init.headers.Authorization, "Bearer fixture-personal-key");
  assert.doesNotMatch(seen[0].url, /fixture-personal-key|authorization/i);
  assert.equal("purchase" in client, false);
  assert.equal("createInvoice" in client, false);
});

test("product parser normalizes fixed packages, country and range products", () => {
  const fixed = parseBitrefillProduct(fixedProduct);
  assert.equal(fixed.country, "US");
  assert.deepEqual(fixed.packages.map((entry) => entry.packageId), ["amazon-us<&>25", "amazon-us<&>50"]);
  assert.equal(fixed.range, null);

  const ranged = parseBitrefillProduct(rangeProduct);
  assert.deepEqual(ranged.range, { min: 10, max: 200, step: 5, priceRate: 1.01 });
  assert.deepEqual(ranged.packages, []);
  assert.equal(parseBitrefillProduct({ ...rangeProduct, country: "USA" }), null);
  assert.equal(parseBitrefillProduct({ ...rangeProduct, range: { min: 200, max: 10, step: 0 } }), null);
});

test("in_stock maps to availability evidence and never invents supplier quantity", () => {
  assert.deepEqual(mapBitrefillAvailability(parseBitrefillProduct(fixedProduct)), {
    available: true,
    supplierQuantity: null,
    evidence: "bitrefill_in_stock_boolean",
  });
  assert.deepEqual(mapBitrefillAvailability(parseBitrefillProduct(rangeProduct)), {
    available: false,
    supplierQuantity: null,
    evidence: "bitrefill_in_stock_boolean",
  });
});

test("pagination metadata is bounded and preserved without automatic full-catalog crawling", () => {
  const parsed = parseBitrefillProductsResponse({
    meta: { start: 0, limit: 50, total_results: 125, _next: "https://api.bitrefill.com/v2/products?start=50&limit=50" },
    data: [fixedProduct],
  });
  assert.equal(parsed.products.length, 1);
  assert.deepEqual(parsed.meta, {
    start: 0,
    limit: 50,
    totalResults: 125,
    next: "https://api.bitrefill.com/v2/products?start=50&limit=50",
  });
});

test("client captures rate-limit and product-quota headers", async () => {
  const client = createBitrefillClient({
    authMode: "personal",
    apiKey: "fixture-key",
    maxRetries: 0,
    fetchImpl: async () => jsonResponse({ meta: { start: 0, limit: 1 }, data: [fixedProduct] }, 200, {
      "x-ratelimit-limit": "60",
      "x-ratelimit-remaining": "59",
      "x-ratelimit-reset": "1900000000",
      "x-product-quota-remaining": "999",
      "x-product-quota-next-window": "3600",
    }),
  });
  const result = await client.listProducts({ country: "US", limit: 1 });
  assert.deepEqual(result.rateLimit, { limit: 60, remaining: 59, reset: 1900000000, productQuotaRemaining: 999, productQuotaNextWindow: 3600 });
});

test("429 and 503 use bounded retries; terminal errors stay normalized", async () => {
  for (const [status, code] of [[429, "RATE_LIMITED"], [503, "UPSTREAM_UNAVAILABLE"]]) {
    let calls = 0;
    const delays = [];
    const client = createBitrefillClient({
      authMode: "personal",
      apiKey: "fixture-key",
      maxRetries: 1,
      sleep: async (delay) => { delays.push(delay); },
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({ error_code: "upstream_detail_must_not_escape", message: "sensitive upstream text" }, status);
      },
    });
    await assert.rejects(
      () => client.ping(),
      (error) => error instanceof BitrefillClientError && error.code === code && error.message === code,
    );
    assert.equal(calls, 2);
    assert.equal(delays.length, 1);
  }
});

test("empty 429 responses remain rate-limited errors and can retry safely", async () => {
  let calls = 0;
  const client = createBitrefillClient({
    authMode: "personal",
    apiKey: "fixture-key",
    maxRetries: 1,
    sleep: async () => {},
    fetchImpl: async () => {
      calls += 1;
      return new Response("", { status: 429, headers: { "x-ratelimit-reset": "1900000000" } });
    },
  });
  await assert.rejects(() => client.ping(), (error) => error.code === "RATE_LIMITED");
  assert.equal(calls, 2);
});

test("malformed upstream payload and HTTP errors fail closed without raw details", async () => {
  const malformed = createBitrefillClient({
    authMode: "personal",
    apiKey: "fixture-key",
    maxRetries: 0,
    fetchImpl: async () => new Response("not-json", { status: 200 }),
  });
  await assert.rejects(() => malformed.ping(), /INVALID_RESPONSE/);

  for (const [status, expected] of [[401, "AUTH_ERROR"], [403, "FORBIDDEN"], [404, "PRODUCT_NOT_FOUND"]]) {
    const client = createBitrefillClient({
      authMode: "personal", apiKey: "fixture-key", maxRetries: 0,
      fetchImpl: async () => jsonResponse({ message: "fixture-key must not escape" }, status),
    });
    await assert.rejects(() => client.getProduct("amazon-us"), (error) => error.code === expected && !error.message.includes("fixture-key"));
  }
});

test("webhook parser keeps only invoice/order identity and status, never redemption secrets", () => {
  const parsed = parseBitrefillWebhookEnvelope({
    id: "inv-1",
    status: "complete",
    orders: [
      { id: "ord-1", status: "delivered", redemption_info: { code: "CARD-SECRET", pin: "1234" } },
      { id: "ord-2", status: "failed", error: "private provider detail" },
    ],
  });
  assert.deepEqual(parsed, {
    invoiceId: "inv-1",
    status: "complete",
    orders: [{ id: "ord-1", status: "delivered" }, { id: "ord-2", status: "failed" }],
  });
  assert.doesNotMatch(JSON.stringify(parsed), /CARD-SECRET|1234|private provider detail/);
});

test("complete invoice never implies delivered orders and partial failure is explicit", () => {
  const invoice = parseBitrefillWebhookEnvelope({
    id: "inv-2",
    status: "complete",
    orders: [{ id: "ord-ok", status: "delivered" }, { id: "ord-failed", status: "failed" }],
  });
  assert.deepEqual(evaluateBitrefillInvoiceOutcome(invoice), {
    invoiceComplete: true,
    allOrdersDelivered: false,
    deliveredOrderIds: ["ord-ok"],
    nonDeliveredOrderIds: ["ord-failed"],
  });
});

test("duplicate webhook idempotency key is deterministic and status-sensitive", () => {
  const first = parseBitrefillWebhookEnvelope({ id: "inv-3", status: "complete", orders: [{ id: "b", status: "failed" }, { id: "a", status: "delivered" }] });
  const duplicate = parseBitrefillWebhookEnvelope({ id: "inv-3", status: "complete", orders: [{ id: "a", status: "delivered" }, { id: "b", status: "failed" }] });
  assert.equal(createBitrefillWebhookIdempotencyKey(first), createBitrefillWebhookIdempotencyKey(duplicate));
  assert.notEqual(
    createBitrefillWebhookIdempotencyKey(first),
    createBitrefillWebhookIdempotencyKey({ ...duplicate, orders: [{ id: "a", status: "delivered" }, { id: "b", status: "delivered" }] }),
  );
});

test("redaction removes authorization, credentials and redemption material recursively", () => {
  const safe = redactBitrefillLogValue({
    Authorization: "Bearer fixture-personal-key",
    nested: { api_secret: "fixture-secret", redemption_info: { code: "CARD-SECRET", pin: "1234" } },
    invoice_id: "inv-safe",
  });
  assert.equal(safe.invoice_id, "inv-safe");
  assert.doesNotMatch(JSON.stringify(safe), /fixture-personal-key|fixture-secret|CARD-SECRET|1234/);
});
