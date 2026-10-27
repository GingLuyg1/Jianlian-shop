import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createBitrefillBusinessAdapter, prepareBitrefillBusinessPurchase, prepareBitrefillBusinessBalancePayment } from "../../lib/providers/bitrefill/business-adapter.mjs";
import { createMockSupplier } from "../../scripts/support/bitrefill-mock-supplier.mjs";
import { REAL_BITREFILL_PURCHASE_ENABLED } from "../../lib/providers/bitrefill/prelaunch-policy.mjs";
import { readBitrefillFulfillment } from "../../lib/admin/bitrefill-fulfillment.mjs";
import { createMemoryMockBackend, createMockService, emptyMockState } from "../../scripts/support/bitrefill-mock-store.mjs";
import { mockAdminReadClient } from "../../scripts/support/bitrefill-mock-view.mjs";
import { createMockShop, mockProduct } from "../../scripts/support/bitrefill-mock-app.mjs";
import { createLocalBitrefillFulfillment } from "../../lib/providers/bitrefill/paid-order-local.mjs";
import ts from "typescript";

test("Business boundary never falls back to Personal, requires reviewed configurable contract, no credentials invented", () => {
  let calls = 0;
  for (const credentials of [undefined, {}, { authMode: "personal" }, { authMode: "business" }]) {
    assert.throws(() => createBitrefillBusinessAdapter({ credentials, fetchImpl: () => { calls++; } }), /BUSINESS_CREDENTIALS_REQUIRED/);
  }
  const input = { products: [{ product_id: "mock-gift-us", package_id: "mock-us-5", quantity: 1 }] };
  const contract = { approved: true, reference: "MOCK-CONTRACT-NOT-A-COMMERCIAL-APPROVAL", paymentMethod: "balance", invoiceStrategy: "single_item", paymentFlow: "auto_pay" };
  assert.deepEqual(prepareBitrefillBusinessPurchase(input, contract), { ...input, payment_method: "balance", auto_pay: true });
  assert.equal(prepareBitrefillBusinessPurchase(input, { ...contract, paymentFlow: "separate_payment" }).auto_pay, false);
  for (const bad of [null, { ...contract, approved: false }, { ...contract, paymentMethod: "guessed" }, { ...contract, invoiceStrategy: "batch" }]) {
    assert.throws(() => prepareBitrefillBusinessPurchase(input, bad), /CONTRACT_REQUIRED/);
  }
  assert.equal(calls, 0); assert.equal(REAL_BITREFILL_PURCHASE_ENABLED, false);
});

test("official separate balance-payment empty body over mock HTTP, repeated pay produces one synthetic debit", async () => {
  const supplier = await createMockSupplier();
  try {
    const body = prepareBitrefillBusinessPurchase({ products: [{ product_id: "mock-gift-us", package_id: "mock-us-5", quantity: 1 }] },
      { approved: true, reference: "MOCK-ONLY", paymentMethod: "balance", invoiceStrategy: "single_item", paymentFlow: "separate_payment" });
    supplier.modes.push("pending");
    const response = await fetch(`${supplier.origin}/invoices`, { method: "POST", redirect: "error", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(3000) });
    const invoice = (await response.json()).data;
    assert.equal((await supplier.transport.readInvoice(invoice.id)).status, "unpaid");
    assert.deepEqual(prepareBitrefillBusinessBalancePayment(invoice.id), { method: "POST", path: `/invoices/${invoice.id}/pay`, body: {} });
    await Promise.all([supplier.transport.payInvoice(invoice.id), supplier.transport.payInvoice(invoice.id)]);
    assert.equal(supplier.paid.size, 1);
    assert.equal((await supplier.transport.readInvoice(invoice.id)).orders[0].status, "processing");
    assert.throws(() => prepareBitrefillBusinessBalancePayment("../wrong"), /ID_INVALID/);
  } finally { await supplier.close(); }
});

test("admin projection uses allowlists, pagination, bounded events and no card content", async () => {
  const state = emptyMockState();
  for (let n = 0; n < 26; n++) state.supplier_purchase_attempts.push({ id: `attempt-${String(n).padStart(2, "0")}`, supplier: "bitrefill",
    status: "UNCERTAIN", external_invoice_id: null, created_at: "2026-10-25T00:00:00Z", last_error_code: null,
    private_key: "FORBIDDEN_METADATA", redemption_info: { code: "FORBIDDEN_CARD" } });
  const first = await readBitrefillFulfillment(mockAdminReadClient(state));
  const second = await readBitrefillFulfillment(mockAdminReadClient(state), 2);
  assert.equal(first.rows.length, 25); assert.equal(first.hasMore, true);
  assert.equal(second.rows.length, 1); assert.equal(second.hasMore, false);
  assert.equal(new Set([...first.rows, ...second.rows].map((r) => r.id)).size, 26);
  assert.equal(JSON.stringify(first).includes("FORBIDDEN"), false);
  assert.ok(first.rows.every((r) => r.manualReview));
  await assert.rejects(readBitrefillFulfillment({}, 0), /PAGE_INVALID/);
  await assert.rejects(readBitrefillFulfillment({ from() { return { select() { throw new Error("MISSING_SCHEMA"); } }; } }), /MISSING_SCHEMA/);
});

test("new admin API authenticates super-admin before service client and is GET-only", () => {
  const source = readFileSync(new URL("../../app/api/admin/suppliers/bitrefill/fulfillment/route.ts", import.meta.url), "utf8");
  assert.ok(source.indexOf("if (!admin.ok)") < source.indexOf("const client = getSupabaseServiceRoleClient()"));
  assert.ok(source.includes('"Cache-Control": "no-store"'));
  assert.equal(/export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)/.test(source), false);
  assert.equal(/readInvoice|createInvoice|payOrder/.test(source), false);
});

test("actual admin GET handler denies unauthenticated/ordinary admin and returns safe read-only data", async () => {
  const source = readFileSync(new URL("../../app/api/admin/suppliers/bitrefill/fulfillment/route.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let access = { ok: false, status: 401, message: "MOCK_LOGIN_REQUIRED" }, clients = 0;
  const dependencies = { "next/server": { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), options) } },
    "@/lib/auth/require-admin": { getServerSuperAdminContext: async () => access },
    "@/lib/supabase/service-role": { getSupabaseServiceRoleClient: () => { clients++; return mockAdminReadClient(emptyMockState()); } },
    "@/lib/admin/bitrefill-fulfillment.mjs": { readBitrefillFulfillment } };
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => { assert.ok(name in dependencies); return dependencies[name]; }, compiledModule, compiledModule.exports);
  const request = (query = "") => new Request(`http://127.0.0.1/mock-admin${query}`);
  assert.equal((await compiledModule.exports.GET(request())).status, 401);
  access = { ok: false, status: 403, message: "MOCK_SUPER_ADMIN_REQUIRED" };
  assert.equal((await compiledModule.exports.GET(request())).status, 403); assert.equal(clients, 0);
  access = { ok: true };
  assert.equal((await compiledModule.exports.GET(request("?page=-1"))).status, 400); assert.equal(clients, 0);
  const response = await compiledModule.exports.GET(request());
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual((await response.json()).rows, []); assert.equal(clients, 1);
});

test("missing trusted cost, excessive cost and unverified Apple package cannot create invoice", async () => {
  const backend = createMemoryMockBackend(), root = fileURLToPath(new URL("../../", import.meta.url));
  const shop = await createMockShop({ backend, root });
  try {
    for (const mode of ["missing", "over_cap", "unmatched_apple"]) {
      const order = await shop.service.createOrder("mock-customer", mode.replaceAll("_", "-"));
      await shop.service.rpc("pay_order_with_balance", { p_order_id: order.id, p_user_id: "mock-customer" });
      if (mode === "unmatched_apple") await backend.transact((s) => {
        s.order_items.find((r) => r.order_id === order.id).product_snapshot.supplier_binding.supplier_sku = "unverified-apple-sku";
      });
      const fulfill = createLocalBitrefillFulfillment({ transport: shop.supplier.transport,
        loadPricing: async () => ({ product: mockProduct, productCheckedAt: new Date().toISOString(),
          quote: mode === "missing" ? null : { source: "synthetic_fixture", synthetic: true, supplier: "bitrefill", quantity: 1,
            productId: "mock-gift-us", packageId: "mock-us-5", currency: "USD", amount: mode === "over_cap" ? "9.00" : "4.80",
            maxAllowedSpend: "5.00", checkedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 240000).toISOString() } }),
        loadFinancialEvidence: async ({ order: o, orderItem: i }) => ({ source: "synthetic_paid_ledger", orderId: o.id, orderItemId: i.id,
          paymentState: "paid", refundState: "none", disputeState: "none", currency: "USD", paidItemAmount: "6.00", paymentFee: "0.10",
          otherFees: "0", maxUnitProfit: "2.00", fxSource: "same_currency_no_conversion" }),
        loadSupplierBalance: async () => ({ source: "synthetic_balance", state: "sufficient", currency: "USD", availableAmount: "100" }) });
      await fulfill(shop.service, order.id);
    }
    assert.equal(shop.supplier.transport.invoiceSubmissions, 0);
    assert.equal((await backend.read()).privateDeliveries.length, 0);
  } finally { await shop.close(); }
});

test("mock refunds reject absent debit, pending/uncertain child, delivered item and retain one credit", async () => {
  const backend = createMemoryMockBackend(), service = createMockService(backend);
  const order = await service.createOrder("mock-customer", "refund-guard");
  const item = (await backend.read()).order_items[0];
  await assert.rejects(service.refundFailedItem(item.id), /REFUND_UNPAID/);
  await service.rpc("pay_order_with_balance", { p_order_id: order.id, p_user_id: "mock-customer" });
  await assert.rejects(service.refundFailedItem(item.id), /REFUND_MANUAL_REVIEW/);
  assert.equal((await backend.read()).ledger.length, 1);
});
