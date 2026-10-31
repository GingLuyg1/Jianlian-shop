import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { prepareBitrefillMcpUsdPurchase } from "../../lib/providers/bitrefill/mcp-usd-adapter.mjs";
import { normalizeBitrefillMcpBalances, readBitrefillMcpRpcResponse } from "../../lib/providers/bitrefill/mcp-readonly-client.mjs";
import { BitrefillMcpPurchaseTransport, bindBitrefillMcpUsdRequest, extractBitrefillMcpCreatedInvoice } from "../../lib/providers/bitrefill/mcp-purchase-transport.mjs";
import { BitrefillFakeTransport } from "../../lib/providers/bitrefill/transport.mjs";
import { normalizeBitrefillProduct, buildBitrefillInvoiceRequest } from "../../lib/providers/bitrefill/provider-core.mjs";
import { prepareBitrefillSingleItem, reconcileBitrefillSingleItem, deliverBitrefillSingleItem } from "../../lib/providers/bitrefill/single-item-purchase.mjs";
import { runBitrefillMcpUsdSingleItemPurchase } from "../../lib/providers/bitrefill/purchase-persistence.mjs";
import { runLocalStockPriorityDelivery } from "../../lib/delivery/local-stock-priority.mjs";
import { collectFrozenSupplierCodes } from "../../lib/providers/core/supplier-router-core.mjs";

const time = Date.parse("2026-10-31T00:00:00Z"), at = new Date(time).toISOString();
const invoiceId = "00000000-0000-4000-8000-000000000001";
const credentials = { authMode: "personal", apiKey: "synthetic-release-key" };
const fingerprint = createHash("sha256").update("bitrefill-personal-key-v1:").update(credentials.apiKey).digest("hex");
const result = value => ({ content: [{ type: "text", text: JSON.stringify(value) }] });

function preparation() {
  const binding = { fulfillment_source: "supplier", supplier: "bitrefill", supplier_product_id: "fixture-steam", supplier_sku: "fixture-package",
    supplier_currency: "USD", supplier_face_value: "5", supplier_max_unit_cost: "5", supplier_min_unit_profit: "1" };
  return { nowMs: time, candidate: {
    order: { id: "order", currency: "USD", status: "paid", payment_status: "paid" },
    orderItem: { id: "item", order_id: "order", quantity: 1, delivery_type: "automatic", delivery_status: "pending", unit_price: "6", product_snapshot: { supplier_binding: binding } },
    root: { id: "root", order_id: "order", order_item_id: "item", status: "PURCHASING", supplier: "bitrefill", supplier_product_id: "fixture-steam", supplier_sku: "fixture-package", attempt_token: "attempt-token", request_id: "request" },
    product: normalizeBitrefillProduct({ id: "fixture-steam", name: "Synthetic product", country: "US", currency: "USD", inStock: true, packages: [{ packageId: "fixture-package", value: 5, price: 4.8 }] }), productCheckedAt: at,
    quote: { source: "synthetic_fixture", synthetic: true, productId: "fixture-steam", packageId: "fixture-package", mcpPackageValue: "5", amount: "4.80", currency: "USD", checkedAt: at, feesIncluded: true, accountFingerprint: fingerprint },
  }, contract: { source: "authenticated_mcp_tools_list", checkedAt: at, accountFingerprint: fingerprint, tools: [{ name: "buy-products", annotations: { destructiveHint: true }, inputSchema: { required: ["cart_items", "payment_method"], properties: {
    payment_method: { enum: ["balance"] }, balance_currency: { enum: ["USD"] }, cart_items: { items: { properties: { package_value: { type: "string" } } } },
  } } }] }, balances: normalizeBitrefillMcpBalances(resultToon(), { checkedAt: at, accountFingerprint: fingerprint }) };
}
function resultToon() { return { content: [{ type: "text", text: 'balances[1]:\n  - payment_method: balance\n    balance_currency: USD\n    amount: "12.34"\n    amount_base: "1234"\n    decimals: 2' }] }; }

class MemoryDb {
  constructor() { this.attempt = null; this.items = []; this.child = null; this.privateWrites = 0; this.claims = 0; }
  async claim(_supplier, key, hash, items) {
    this.claims++;
    if (this.attempt) { assert.equal(key, this.key); return { result: "ALREADY_CLAIMED", attempt_id: "attempt" }; }
    this.key = key; this.attempt = { id: "attempt", status: "CLAIMED", semantic_request_hash: hash };
    this.items = items.map(item => ({ ...item, id: "attempt-item", attempt_id: "attempt" }));
    return { result: "CLAIMED", attempt_id: "attempt" };
  }
  async getAttempt() { return structuredClone(this.attempt); }
  async transition(_id, expected, next, external = null) {
    if (this.attempt.status !== expected) return { result: "NOT_TRANSITIONED" };
    this.attempt.status = next; if (external) this.attempt.external_invoice_id = external; return { result: "TRANSITIONED" };
  }
  async getAttemptItems() { return this.items; }
  async getAttemptItem() { return this.items[0]; }
  async recordChild(itemId, external) { this.child ??= { id: "child-row", attempt_id: "attempt", attempt_item_id: itemId, external_order_id: external, supplier: "bitrefill" }; return { external_order_row_id: this.child.id }; }
  async recordEvidence(_attempt, _child, status) { this.child.normalized_status = status; }
  async getExternalChild() { return this.child; }
  async getRoot() { return preparation().candidate.root; }
  async recordPrivateOutcome(_context, content) {
    assert.equal(JSON.parse(content).code, "SYNTHETIC_PRIVATE_CODE"); const duplicate = this.privateWrites > 0;
    if (!duplicate) this.privateWrites++; return { ok: true, delivery_id: "delivery", idempotent: duplicate };
  }
}

class SyntheticMcpTransport extends BitrefillFakeTransport {
  constructor(p, error = null) {
    super({ invoice: { id: invoiceId, status: "complete", orders: [{ id: "child", status: "delivered" }] },
      orders: { child: { id: "child", invoice_id: invoiceId, status: "delivered", product: { id: "fixture-steam", package_id: "fixture-package", currency: "USD", value: 5 }, redemption_info: { code: "SYNTHETIC_PRIVATE_CODE" } } } });
    this.plan = prepareBitrefillMcpUsdPurchase(p); this.frozen = buildBitrefillInvoiceRequest({ items: [prepareBitrefillSingleItem({ ...p.candidate, nowMs: p.nowMs }).item] }); this.error = error;
  }
  async createInvoice(request) {
    this.lastArguments = bindBitrefillMcpUsdRequest(request, this.plan, this.frozen); this.invoiceSubmissions++;
    if (this.error === "timeout") { const e = new Error("SYNTHETIC_TIMEOUT"); e.submitted = true; throw e; }
    return extractBitrefillMcpCreatedInvoice(this.error === "PAYMENT_UNCERTAIN"
      ? { ...result({ code: "PAYMENT_UNCERTAIN", details: {} }), isError: true } : result({ response: { invoice_id: invoiceId } }));
  }
}
const run = (p, db, transport, refresh = async () => p) => runBitrefillMcpUsdSingleItemPurchase({ preparation: p, db, transport, refreshEvidence: refresh });

test("MCP synthetic creation uses existing durable claim, exact GET child and private RPC; replay never buys twice", async () => {
  const p = preparation(), db = new MemoryDb(), t = new SyntheticMcpTransport(p);
  assert.equal((await run(p, db, t)).invoiceId, invoiceId); assert.equal(t.lastArguments.balance_currency, "USD");
  assert.equal((await run(p, db, t)).submitted, false); assert.equal(t.invoiceSubmissions, 1);
  const check = await reconcileBitrefillSingleItem({ db, transport: t, attemptId: "attempt" }); assert.equal(check.requiresManualReview, false);
  assert.equal((await deliverBitrefillSingleItem({ db, transport: t, childRowId: "child-row" })).delivered, true);
  assert.equal((await deliverBitrefillSingleItem({ db, transport: t, childRowId: "child-row" })).idempotent, true);
  assert.equal(db.privateWrites, 1); assert.equal(JSON.stringify(check).includes("SYNTHETIC_PRIVATE_CODE"), false);
});

test("timeout and PAYMENT_UNCERTAIN persist UNCERTAIN and cannot produce a second debit", async () => {
  for (const failure of ["timeout", "PAYMENT_UNCERTAIN"]) {
    const p = preparation(), db = new MemoryDb(), t = new SyntheticMcpTransport(p, failure);
    assert.equal((await run(p, db, t)).status, "UNCERTAIN");
    assert.equal((await run(p, db, t)).submitted, false); assert.equal(t.invoiceSubmissions, 1); assert.equal(db.privateWrites, 0);
  }
});

test("a known uncertain Invoice ID is preserved only as a reconciliation reference", () => {
  const value = extractBitrefillMcpCreatedInvoice({ ...result({ code: "PAYMENT_UNCERTAIN", details: { invoice_id: invoiceId } }), isError: true });
  assert.deepEqual(value, { id: invoiceId, requiresManualReview: true });
});

test("pre-submit price, balance, credential or frozen binding drift stops before sending", async () => {
  for (const change of [p => { p.candidate.quote.amount = "4.90"; }, p => { p.balances = { ...p.balances, balances: [{ ...p.balances.balances[0], availableAmount: "0.00" }] }; },
    p => { p.contract.accountFingerprint = "f".repeat(64); }, p => { p.candidate.root.attempt_token = "changed"; }]) {
    const p = preparation(), db = new MemoryDb(), t = new SyntheticMcpTransport(p), fresh = structuredClone(p); change(fresh);
    const value = await run(p, db, t, async () => fresh); assert.equal(value.status, "UNCERTAIN"); assert.equal(value.submitted, false);
    assert.equal(t.invoiceSubmissions, 0); assert.equal((await run(p, db, t)).submitted, false);
  }
});

test("insufficient USD and fee-unknown display prices cannot claim a purchase", async () => {
  for (const change of [p => { p.balances = { ...p.balances, balances: [{ ...p.balances.balances[0], availableAmount: "0.00" }] }; },
    p => { p.candidate.quote.feesIncluded = false; }, p => { p.candidate.quote.source = "authenticated_mcp_display_price"; }]) {
    const p = preparation(), db = new MemoryDb(), t = new SyntheticMcpTransport(p); change(p);
    await assert.rejects(run(p, db, t), /BITREFILL_/); assert.equal(db.claims, 0); assert.equal(t.invoiceSubmissions, 0);
  }
});

test("partial/multiple child results or missing codes never reach private delivery", async () => {
  for (const change of [t => { t.fixtures.invoice.orders.push({ id: "other", status: "failed" }); },
    t => { t.fixtures.orders.child.redemption_info = {}; }, t => { t.fixtures.orders.child.product.id = "other-product"; },
    t => { t.fixtures.invoice.status = "payment_error"; }]) {
    const p = preparation(), db = new MemoryDb(), t = new SyntheticMcpTransport(p); await run(p, db, t); change(t);
    try { const value = await reconcileBitrefillSingleItem({ db, transport: t, attemptId: "attempt" }); assert.equal(value.requiresManualReview, true); }
    catch(error) { assert.match(error.message, /BITREFILL_/); }
    if (db.child) await assert.rejects(deliverBitrefillSingleItem({ db, transport: t, childRowId: "child-row" }), /BITREFILL_/);
    assert.equal(db.privateWrites, 0);
  }
});

test("existing local-stock priority suppresses MCP and keeps frozen supplier selection", async () => {
  const p = preparation(), db = new MemoryDb(), t = new SyntheticMcpTransport(p), item = p.candidate.orderItem;
  await runLocalStockPriorityDelivery({ reserveLocal: async () => ({ ok: true, local_ready_count: 1, supplier_fallback_count: 0, blocked_count: 0 }),
    deliverLocal: async () => { item.delivery_status = "delivered"; }, deliverSupplier: async () => { if (collectFrozenSupplierCodes([item]).includes("bitrefill")) await run(p, db, t); } });
  assert.equal(t.invoiceSubmissions, 0); assert.equal(db.claims, 0);
  const wrong = preparation(); wrong.candidate.orderItem.product_snapshot.supplier_binding.supplier = "daju";
  await assert.rejects(run(wrong, db, t), /FROZEN_BINDING/); assert.equal(t.invoiceSubmissions, 0);
});

test("insufficient unreserved local stock follows exactly the frozen Bitrefill fallback", async () => {
  const p = preparation(), db = new MemoryDb(), t = new SyntheticMcpTransport(p);
  await runLocalStockPriorityDelivery({ reserveLocal: async () => ({ ok: true, local_ready_count: 0, supplier_fallback_count: 1, blocked_count: 0 }),
    deliverLocal: async () => {}, deliverSupplier: async () => { assert.deepEqual(collectFrozenSupplierCodes([p.candidate.orderItem]), ["bitrefill"]); return run(p, db, t); } });
  assert.equal(t.invoiceSubmissions, 1); assert.equal(db.attempt.status, "EXTERNAL_CREATED");
});

test("credential identity is bound in both the transport and durable semantic hash", async () => {
  const p = preparation(), db = new MemoryDb(), t = new SyntheticMcpTransport(p); await run(p, db, t);
  const other = structuredClone(p), account = "f".repeat(64);
  other.contract.accountFingerprint = account; other.balances.accountFingerprint = account; other.candidate.quote.accountFingerprint = account;
  await assert.rejects(run(other, db, new SyntheticMcpTransport(other)), /SEMANTIC_CONFLICT/);
  const frozen = buildBitrefillInvoiceRequest({ items: [prepareBitrefillSingleItem({ ...p.candidate, nowMs: p.nowMs }).item] });
  assert.throws(() => new BitrefillMcpPurchaseTransport({ credentials: { ...credentials, apiKey: "other-synthetic-key" }, preparedPlan: prepareBitrefillMcpUsdPurchase(p), frozenRequest: frozen, fetchImpl: async () => {} }), /TRANSPORT_ACCOUNT_MISMATCH/);
  assert.equal(t.invoiceSubmissions, 1);
});

test("real MCP transport and entry remain closed even with explicit enable flag; no second-payment endpoint", async () => {
  const p = preparation(), plan = prepareBitrefillMcpUsdPurchase(p), frozen = buildBitrefillInvoiceRequest({ items: [prepareBitrefillSingleItem({ ...p.candidate, nowMs: p.nowMs }).item] });
  let calls = 0; const transport = new BitrefillMcpPurchaseTransport({ credentials, preparedPlan: plan, frozenRequest: frozen, purchaseEnabled: true, fetchImpl: async () => { calls++; throw Error("NO_NETWORK"); } });
  await assert.rejects(transport.createInvoice(frozen), /REAL_PURCHASE_DISABLED/); await assert.rejects(transport.payInvoice(invoiceId), /SECOND_PAYMENT_FORBIDDEN/);
  await assert.rejects(run(p, new MemoryDb(), transport), /REAL_PURCHASE_DISABLED/); assert.equal(transport.purchaseEnabled, false); assert.equal(calls, 0);
});

test("bounded decoder exposes uncertain tool errors only to the guarded purchase parser", async () => {
  const payload = { jsonrpc: "2.0", id: 1, result: { ...result({ code: "PAYMENT_UNCERTAIN", details: { invoice_id: invoiceId } }), isError: true } };
  await assert.rejects(readBitrefillMcpRpcResponse(new Response(JSON.stringify(payload)), 1), /TOOL_ERROR/);
  const value = await readBitrefillMcpRpcResponse(new Response(JSON.stringify(payload)), 1, { allowToolError: true });
  assert.equal(extractBitrefillMcpCreatedInvoice(value).id, invoiceId);
});
