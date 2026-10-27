import assert from "node:assert/strict";
import { createMockShop, mockProduct } from "../../scripts/support/bitrefill-mock-app.mjs";
import { createBitrefillPurchaseRpcAdapter, runBitrefillOfflinePurchase,
  reconcileBitrefillOfflineAttempt, deliverBitrefillOfflineChild } from "../../lib/providers/bitrefill/purchase-persistence.mjs";

export async function runMockHttpCases({ backend, root }) {
  const shop = await createMockShop({ backend, root });
  const call = async (path, role = "mock-customer", body) => {
    const response = await fetch(`${shop.origin}${path}`, { method: body ? "POST" : "GET", redirect: "error",
      headers: { "x-mock-session": shop.capabilities[role] ?? "", "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
    return { status: response.status, body: await response.json() };
  };
  let checks = 0;
  const check = (value) => { assert.ok(value); checks++; };
  try {
    check((await call("/orders", "anonymous", { requestId: "invalid" })).status === 401);
    // HTTP checkout, actual balance-payment TS service, actual delivery/router,
    // existing P2 -> P1 -> existing private-outcome interface. Only DB RPCs mocked.
    const create = await call("/orders", "mock-customer", { requestId: "checkout", count: 2 });
    check(create.status === 201);
    const order = create.body;
    check((await call("/orders", "mock-customer", { requestId: "checkout", count: 2 })).body.id === order.id);
    check((await call(`/orders/${order.id}/poll`, "mock-customer", {})).status === 409);
    check(shop.supplier.transport.invoiceSubmissions === 0);
    shop.supplier.modes.push("delivered", "failed");
    const payments = await Promise.all(Array.from({ length: 6 }, () => call(`/orders/${order.id}/pay`, "mock-customer", { requestId: "pay-checkout" })));
    check(payments.every((r) => r.status === 200));
    // CAS loser may finish before the winner. A GET-only reconciliation catches up.
    await call(`/orders/${order.id}/poll`, "mock-customer", {});
    let state = await backend.read();
    check(state.ledger.filter((r) => r.id === `debit:${order.id}`).length === 1);
    check(shop.supplier.transport.invoiceSubmissions === 2);
    check(state.privateDeliveries.length === 1);
    check((await call(`/orders/${order.id}/cards`)).body.cards.length === 1);
    check((await call(`/orders/${order.id}/cards`, "mock-other")).status === 404);
    check((await call("/admin/fulfillment", "mock-customer")).status === 404);
    const admin = await call("/admin/fulfillment", "mock-admin");
    check(admin.status === 200 && admin.body.rows.length === 2);
    check(!JSON.stringify(admin.body).includes("MOCK-CARD-"));
    check(admin.body.rows.every((r) => r.cost === "4.80" && r.costVerified === false));
    const failed = admin.body.rows.find((r) => r.childStatus === "FAILED");
    check(Boolean(failed));
    const refunds = await Promise.all([0, 1, 2].map(() => call(`/admin/items/${failed.id}/refund`, "mock-admin", {})));
    check(refunds.every((r) => r.status === 200));
    state = await backend.read();
    check(state.ledger.filter((r) => r.cents > 0).length === 1 && state.balances["mock-customer"] === 99400);
    const delivered = admin.body.rows.find((r) => r.childStatus === "DELIVERED");
    check((await call(`/admin/items/${delivered.id}/refund`, "mock-admin", {})).status === 409);
    check((await call(`/orders/${order.id}/pay`, "mock-other", {})).status === 404);
    check(shop.supplier.transport.invoiceSubmissions === 2);

    // Pending, delayed/duplicate spoofed webhook and poll racing the same invoice.
    const pending = (await call("/orders", "mock-customer", { requestId: "pending" })).body;
    shop.supplier.modes.push("pending");
    await call(`/orders/${pending.id}/pay`, "mock-customer", {});
    state = await backend.read();
    const pendingItem = state.order_items.find((r) => r.order_id === pending.id);
    const unit = state.supplier_purchase_attempt_items.find((r) => r.order_item_id === pendingItem.id);
    const attempt = state.supplier_purchase_attempts.find((r) => r.id === unit.attempt_id);
    const event = { eventId: "mock-delayed", invoiceId: attempt.external_invoice_id, status: "complete", redemption_info: { code: "INJECTED_WEBHOOK" } };
    check((await call("/webhook", "mock-webhook", event)).status === 200);
    check((await call(`/orders/${pending.id}/cards`)).body.cards.length === 0);
    shop.supplier.advance(attempt.external_invoice_id, ["delivered"]);
    await Promise.all([call("/webhook", "mock-webhook", { ...event, eventId: "mock-final" }),
      call("/webhook", "mock-webhook", { ...event, eventId: "mock-final" }), call(`/orders/${pending.id}/poll`, "mock-customer", {})]);
    check((await call(`/orders/${pending.id}/cards`)).body.cards.length === 1);
    check((await call("/webhook", "mock-webhook", event)).body.reconciled === false);
    check(!JSON.stringify(await backend.read()).includes("INJECTED_WEBHOOK"));
    check(shop.supplier.transport.invoiceSubmissions === 3);

    for (const mode of ["timeout", "wrong"]) {
      const bad = (await call("/orders", "mock-customer", { requestId: mode })).body;
      shop.supplier.modes.push(mode);
      const before = shop.supplier.transport.invoiceSubmissions;
      await call(`/orders/${bad.id}/pay`, "mock-customer", {});
      await call(`/orders/${bad.id}/poll`, "mock-customer", {});
      await call(`/orders/${bad.id}/pay`, "mock-customer", {});
      check(shop.supplier.transport.invoiceSubmissions === before + 1);
      check((await call(`/orders/${bad.id}/cards`)).body.cards.length === 0);
      const rows = (await call("/admin/fulfillment", "mock-admin")).body.rows.filter((r) => r.orderId === bad.id);
      check(rows[0].status === "UNCERTAIN");
      check((await call(`/admin/items/${rows[0].id}/refund`, "mock-admin", {})).status === 409);
    }

    // Mock-only multiple-child invoice: explicit references, reversed GET order,
    // no positional matching. Real purchase remains single-item and disabled.
    const batch = await shop.service.createOrder("mock-customer", "batch", 2);
    const paid = await shop.service.rpc("pay_order_with_balance", { p_order_id: batch.id, p_user_id: "mock-customer" });
    check(!paid.error);
    state = await backend.read();
    const items = state.order_items.filter((r) => r.order_id === batch.id);
    const inputs = [];
    for (const item of items) {
      const root = await shop.service.rpc("claim_supplier_fulfillment", { p_order_id: batch.id, p_order_item_id: item.id,
        p_request_id: `mock-batch:${item.id}`, p_supplier_product_id: "mock-gift-us", p_supplier_sku: "mock-us-5" });
      inputs.push({ orderItemId: item.id, fulfillmentRequestId: root.data.id, quantity: 1,
        binding: { supplier: "bitrefill", productId: "mock-gift-us", sku: "mock-us-5", currency: "USD", faceValue: "5.00" },
        product: mockProduct, expectedCost: "4.80", frozenQuotedCost: "4.80", frozenMaxSupplierCost: "5.00" });
    }
    const db = createBitrefillPurchaseRpcAdapter(shop.service);
    shop.supplier.transport.references = async () => {
      const latest = await backend.read();
      return latest.supplier_purchase_attempt_items.filter((r) => items.some((i) => i.id === r.order_item_id)).map((r) => r.id);
    };
    shop.supplier.modes.push("delivered");
    const [batchAttempt] = await runBitrefillOfflinePurchase({ db, transport: shop.supplier.transport, logicalKeyPrefix: `mock-batch:${batch.id}`, items: inputs });
    // Offline reconciliation reads redemption through authoritative invoice GET.
    const invoice = shop.supplier.invoices.get(batchAttempt.invoiceId);
    for (const ref of invoice.orders) Object.assign(ref, shop.supplier.children.get(ref.id));
    const mapped = await reconcileBitrefillOfflineAttempt({ db, transport: shop.supplier.transport, attemptId: batchAttempt.attemptId });
    check(mapped.deliveryCandidates.length === 2);
    for (const candidate of mapped.deliveryCandidates) await deliverBitrefillOfflineChild({ db, transport: shop.supplier.transport, childRowId: candidate.childRowId });
    state = await backend.read();
    check(state.privateDeliveries.filter((r) => r.order_id === batch.id).length === 2);
    const batchUnits = state.supplier_purchase_attempt_items.filter((r) => r.attempt_id === batchAttempt.attemptId);
    for (const persisted of batchUnits) {
      const external = state.supplier_external_orders.find((r) => r.attempt_item_id === persisted.id);
      check(shop.supplier.children.get(external.external_order_id).client_reference === persisted.id);
    }
    delete invoice.orders[0].client_reference;
    await assert.rejects(reconcileBitrefillOfflineAttempt({ db, transport: shop.supplier.transport, attemptId: batchAttempt.attemptId }), /CORRELATION_INVALID/); checks++;
    check(shop.supplier.calls.every((r) => /^\/(invoices|orders)(\/|$)/.test(r.path)));
    check(!JSON.stringify(shop.supplier.calls).includes("MOCK-CARD-"));

    // V3: inject failure AFTER the synthetic ledger mutation, but BEFORE backend
    // commit. The same assertions run with memory and PostgreSQL CAS backends.
    const atomicOrder = (await call("/orders", "mock-customer", { requestId: "v3-atomic" })).body;
    const beforeAtomic = await backend.read(), submitsBeforeAtomic = shop.supplier.transport.invoiceSubmissions;
    const originalTransact = backend.transact.bind(backend);
    let failCommit = true;
    backend.transact = (fn) => originalTransact((s) => {
      const result = fn(s);
      if (failCommit) { failCommit = false; throw new Error("MOCK_INJECTED_COMMIT_FAILURE"); }
      return result;
    });
    try {
      check((await call(`/orders/${atomicOrder.id}/pay`, "mock-customer", {})).status === 409);
      let atomic = await backend.read();
      check(atomic.balances["mock-customer"] === beforeAtomic.balances["mock-customer"]);
      check(!atomic.ledger.some((r) => r.order_id === atomicOrder.id));
      check(atomic.orders.find((r) => r.id === atomicOrder.id).payment_status === "unpaid");
      check(shop.supplier.transport.invoiceSubmissions === submitsBeforeAtomic);
      shop.supplier.modes.push("failed");
      check((await call(`/orders/${atomicOrder.id}/pay`, "mock-customer", {})).status === 200);
      atomic = await backend.read();
      const atomicItem = atomic.order_items.find((r) => r.order_id === atomicOrder.id);
      const balanceAfterPay = atomic.balances["mock-customer"];
      failCommit = true;
      check((await call(`/admin/items/${atomicItem.id}/refund`, "mock-admin", {})).status === 409);
      atomic = await backend.read();
      check(atomic.balances["mock-customer"] === balanceAfterPay);
      check(!atomic.ledger.some((r) => r.id === `refund:${atomicItem.id}`));
      check(!atomic.order_items.find((r) => r.id === atomicItem.id).refunded);
      const replay = await Promise.all([0, 1].map(() => call(`/admin/items/${atomicItem.id}/refund`, "mock-admin", {})));
      check(replay.every((r) => r.status === 200));
      atomic = await backend.read();
      check(atomic.ledger.filter((r) => r.id === `debit:${atomicOrder.id}`).length === 1);
      check(atomic.ledger.filter((r) => r.id === `refund:${atomicItem.id}`).length === 1);
      check(atomic.balances["mock-customer"] === beforeAtomic.balances["mock-customer"]);
    } finally { backend.transact = originalTransact; }
    return { checks, transport: "LOOPBACK_HTTP_ONLY", persistence: backend.kind ?? "memory", db9Executed: false };
  } finally { await shop.close(); }
}
