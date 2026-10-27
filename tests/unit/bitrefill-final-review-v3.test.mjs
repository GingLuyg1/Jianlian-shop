import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createMockShop } from "../../scripts/support/bitrefill-mock-app.mjs";
import { createMemoryMockBackend, emptyMockState } from "../../scripts/support/bitrefill-mock-store.mjs";
import { createMockSupplier } from "../../scripts/support/bitrefill-mock-supplier.mjs";
import { mockAdminReadClient } from "../../scripts/support/bitrefill-mock-view.mjs";
import { readBitrefillFulfillment } from "../../lib/admin/bitrefill-fulfillment.mjs";
import { readCatalogDiagnosticBody } from "../../scripts/diagnose-bitrefill-catalog-shape.mjs";

test("V3 refund rejects a coherent foreign invoice and wrong denomination/currency/quantity/status without credit", async () => {
  const backend = createMemoryMockBackend();
  const shop = await createMockShop({ backend, root: fileURLToPath(new URL("../../", import.meta.url)) });
  const call = async (path, role, body) => {
    const response = await fetch(`${shop.origin}${path}`, { method: "POST", redirect: "error",
      headers: { "Content-Type": "application/json", "x-mock-session": shop.capabilities[role] },
      body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
    return { status: response.status, data: await response.json() };
  };
  const readInvoice = shop.supplier.transport.readInvoice.bind(shop.supplier.transport);
  const readOrder = shop.supplier.transport.readOrder.bind(shop.supplier.transport);
  try {
    const { data: order } = await call("/orders", "mock-customer", { requestId: "v3-refund" });
    shop.supplier.modes.push("failed");
    assert.equal((await call(`/orders/${order.id}/pay`, "mock-customer", {})).status, 200);
    const state = await backend.read(), item = state.order_items[0];
    const foreign = "mock-invoice-foreign";
    const faults = [
      { invoice: (i) => ({ ...i, id: foreign }), order: (o) => ({ ...o, invoice_id: foreign }) },
      { order: (o) => ({ ...o, product: { ...o.product, currency: "EUR" } }) },
      { order: (o) => ({ ...o, product: { ...o.product, value: 6 } }) },
      { order: (o) => ({ ...o, quantity: 2 }) },
      { invoice: (i) => ({ ...i, orders: i.orders.map((c) => ({ ...c, status: "delivered" })) }) },
    ];
    for (const fault of faults) {
      shop.supplier.transport.readInvoice = async (id) => { const value = await readInvoice(id); return fault.invoice?.(value) ?? value; };
      shop.supplier.transport.readOrder = async (id) => { const value = await readOrder(id); return fault.order?.(value) ?? value; };
      assert.equal((await call(`/admin/items/${item.id}/refund`, "mock-admin", {})).status, 409);
      const unchanged = await backend.read();
      assert.equal(unchanged.balances["mock-customer"], 99400);
      assert.equal(unchanged.ledger.filter((r) => r.cents > 0).length, 0);
    }
    shop.supplier.transport.readInvoice = readInvoice;
    shop.supplier.transport.readOrder = readOrder;
    const refunds = await Promise.all([0, 1].map(() => call(`/admin/items/${item.id}/refund`, "mock-admin", {})));
    assert.ok(refunds.every((r) => r.status === 200));
    const final = await backend.read();
    assert.equal(final.balances["mock-customer"], 100000);
    assert.equal(final.ledger.filter((r) => r.cents > 0).length, 1);
  } finally { await shop.close(); }
});

test("V3 delayed supplier status cannot regress a completed invoice or partially mutate invalid transitions", async () => {
  const supplier = await createMockSupplier();
  try {
    supplier.modes.push("delivered");
    const invoice = await supplier.transport.createInvoice({ products: [{ product_id: "mock-gift-us", package_id: "mock-us-5", quantity: 1 }] });
    supplier.advance(invoice.id, ["processing"]);
    assert.equal((await supplier.transport.readInvoice(invoice.id)).status, "complete");
    assert.throws(() => supplier.advance(invoice.id, ["invented-status"]), /MOCK_ADVANCE_INVALID/);
    assert.equal((await supplier.transport.readInvoice(invoice.id)).status, "complete");
  } finally { await supplier.close(); }
});

test("V3 oversized mock invoice rejects before creating orphan children, invoice or debit", async () => {
  const supplier = await createMockSupplier();
  try {
    const product = { product_id: "mock-gift-us", package_id: "mock-us-5", quantity: 11 };
    const response = await fetch(`${supplier.origin}/invoices`, { method: "POST", redirect: "error",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ products: [product, product], auto_pay: true }),
      signal: AbortSignal.timeout(3000) });
    assert.equal(response.status, 400);
    assert.equal(supplier.children.size, 0);
    assert.equal(supplier.invoices.size, 0);
    assert.equal(supplier.paid.size, 0);
  } finally { await supplier.close(); }
});

test("V3 admin mock ordering preserves created_at priority then id before pagination", async () => {
  const state = emptyMockState();
  for (let n = 0; n < 26; n++) state.supplier_purchase_attempts.push({ id: `attempt-${String(n).padStart(2, "0")}`,
    supplier: "bitrefill", status: "UNCERTAIN", external_invoice_id: null, last_error_code: null,
    created_at: n < 2 ? "2026-10-25T01:00:00Z" : "2026-10-24T01:00:00Z" });
  const page = await readBitrefillFulfillment(mockAdminReadClient(state));
  assert.deepEqual(page.rows.slice(0, 2).map((r) => r.id), ["attempt-01", "attempt-00"]);
  const next = await readBitrefillFulfillment(mockAdminReadClient(state), 2);
  assert.deepEqual(next.rows.map((r) => r.id), ["attempt-02"]);
  assert.equal(new Set([...page.rows, ...next.rows].map((r) => r.id)).size, 26);
});

test("V3 catalog diagnostic cancels oversized streams before buffering the entire body", async () => {
  let pulls = 0, cancelled = false;
  const body = new ReadableStream({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(256 * 1024)); },
    cancel() { cancelled = true; } }, { highWaterMark: 0 });
  await assert.rejects(readCatalogDiagnosticBody(new Response(body)), /BODY_TOO_LARGE/);
  assert.equal(pulls, 3); assert.equal(cancelled, true);
  await assert.rejects(readCatalogDiagnosticBody(new Response("", { headers: { "content-length": String(512 * 1024 + 1) } })), /BODY_TOO_LARGE/);
  assert.deepEqual(await readCatalogDiagnosticBody(new Response('{"data":[]}')), { data: [] });
});
