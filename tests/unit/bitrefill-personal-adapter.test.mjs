import test from "node:test";
import assert from "node:assert/strict";
import { createBitrefillPersonalAdapter, normalizeBitrefillAccountBalance } from "../../lib/providers/bitrefill/personal-adapter.mjs";
import { runLocalStockPriorityDelivery } from "../../lib/delivery/local-stock-priority.mjs";
import { collectFrozenSupplierCodes } from "../../lib/providers/core/supplier-router-core.mjs";

const credentials = { authMode: "personal", apiKey: "synthetic-personal-key" };

test("Personal adapter reuses authenticated GET balance without asserting invoice permission", async () => {
  const calls = [];
  const adapter = createBitrefillPersonalAdapter({ credentials, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ data: { balance: 0, currency: "BTC", ignored_private_field: "not-returned" } }));
  } });
  const balance = await adapter.readBalance();
  assert.equal(balance.availableAmount, "0"); assert.equal(balance.currency, "BTC");
  assert.equal(balance.purchasePermission, "unverified");
  assert.equal(balance.ignored_private_field, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.bitrefill.com/v2/accounts/balance");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers.Authorization, "Bearer synthetic-personal-key");
  assert.equal(calls[0].init.redirect, "error");
});

test("Personal adapter cannot enable invoice creation or balance payment even with extra flags", async () => {
  let calls = 0;
  const adapter = createBitrefillPersonalAdapter({ credentials, purchaseEnabled: true,
    fetchImpl: async () => { calls++; throw Error("NETWORK_FORBIDDEN"); } });
  await assert.rejects(adapter.createInvoice({ products: [{ product_id: "steam-usa", package_id: "steam-usa<&>5", quantity: 1 }] }), /REAL_PURCHASE_DISABLED/);
  await assert.rejects(adapter.payInvoice("synthetic-owned-invoice"), /REAL_PURCHASE_DISABLED/);
  assert.equal(adapter.purchaseEnabled, false); assert.equal(calls, 0);
});

test("Personal and Business identities cannot be mixed or silently fall back", () => {
  for (const candidate of [{ authMode: "business", apiId: "id", apiSecret: "secret" },
    { ...credentials, apiId: "id" }, { ...credentials, apiSecret: "secret" }, { authMode: "personal" }]) {
    assert.throws(() => createBitrefillPersonalAdapter({ credentials: candidate, fetchImpl: async () => {} }), /PERSONAL_CREDENTIALS_REQUIRED/);
  }
});

test("Balance parser rejects missing currency, negative, non-finite or invented available amount", () => {
  for (const candidate of [{ balance: -1, currency: "BTC" }, { balance: Infinity, currency: "BTC" },
    { available: 100, currency: "USD" }, { balance: "2", currency: "" }, { balance: "2e8", currency: "USD" }]) {
    assert.throws(() => normalizeBitrefillAccountBalance(candidate), /BALANCE_RESPONSE_INVALID/);
  }
  assert.equal(normalizeBitrefillAccountBalance({ balance: "0.00000001", currency: "BTC" }).availableAmount, "0.00000001");
  assert.equal(normalizeBitrefillAccountBalance({ balance: 1e-8, currency: "BTC" }).availableAmount, "0.00000001");
});

test("Known-owned GET reconciliation IDs are validated; no accidental invoice enumeration", async () => {
  let calls = 0;
  const adapter = createBitrefillPersonalAdapter({ credentials, fetchImpl: async () => { calls++; return new Response(JSON.stringify({ data: { status: "created" } })); } });
  await assert.rejects(adapter.readInvoice("../orders"), /EXTERNAL_ID_INVALID/);
  await assert.rejects(adapter.readOrder("/accounts/balance"), /EXTERNAL_ID_INVALID/);
  assert.equal(calls, 0);
  await adapter.readInvoice("synthetic-owned-invoice"); assert.equal(calls, 1);
});

test("Existing local stock priority prevents supplier access after full local delivery", async () => {
  let localDelivered = false, network = 0;
  const item = { delivery_type: "automatic", delivery_status: "pending", product_snapshot: { supplier_binding: { supplier: "bitrefill" } } };
  const adapter = createBitrefillPersonalAdapter({ credentials, fetchImpl: async () => { network++; throw Error("NETWORK_FORBIDDEN"); } });
  await runLocalStockPriorityDelivery({
    reserveLocal: async () => ({ ok: true, local_ready_count: 2, supplier_fallback_count: 0, blocked_count: 0 }),
    deliverLocal: async () => { localDelivered = true; item.delivery_status = "delivered"; return { ok: true }; },
    deliverSupplier: async () => { for (const supplier of collectFrozenSupplierCodes([item])) if (supplier === "bitrefill") await adapter.createInvoice({}); return { fulfilled: 0 }; },
  });
  assert.equal(localDelivered, true); assert.equal(network, 0);
});

test("Blocked/partially reserved local stock stops before supplier fallback", async () => {
  let fallback = 0;
  await assert.rejects(runLocalStockPriorityDelivery({
    reserveLocal: async () => ({ ok: true, local_ready_count: 0, supplier_fallback_count: 0, blocked_count: 1 }),
    deliverLocal: async () => { throw Error("MUST_NOT_DELIVER"); },
    deliverSupplier: async () => { fallback++; },
  }), /LOCAL_PRIORITY_BLOCKED/);
  assert.equal(fallback, 0);
});
