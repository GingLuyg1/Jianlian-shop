import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { createMockService } from "./bitrefill-mock-store.mjs";
import { createMockSupplier, readMockJson, mockJson, listenMock, closeMock } from "./bitrefill-mock-supplier.mjs";
import { createLocalBitrefillFulfillment, dispatchLocalPaidSuppliers, wakeLocalBitrefill } from "../../lib/providers/bitrefill/paid-order-local.mjs";
import { normalizeBitrefillProduct } from "../../lib/providers/bitrefill/provider-core.mjs";
import { runPostPaymentDelivery } from "../../lib/orders/post-payment-delivery.mjs";
import { decimalMicros } from "../../lib/providers/bitrefill/quote-core.mjs";
import { loadActualLocalDeliveryEntry } from "../../tests/support/bitrefill-p2-delivery-entry.mjs";

export const mockProduct = normalizeBitrefillProduct({ id: "mock-gift-us", name: "MOCK ONLY — unverified gift",
  country: "US", currency: "USD", type: "gift_card", inStock: true,
  packages: [{ packageId: "mock-us-5", value: 5, price: 4.8 }] });

function actualPaymentService(root, deliver) {
  const source = readFileSync(resolve(root, "lib/orders/balance-payment-service.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS } }).outputText;
  const dependencies = { "server-only": {}, "@/lib/delivery/delivery-service": { deliverDigitalOrder: deliver,
    getDeliveryErrorMessage: () => "MOCK_MANUAL_REVIEW" }, "@/lib/orders/order-queries": { getOrderErrorMessage: () => "MOCK_ERROR" },
    "@/lib/orders/post-payment-delivery.mjs": { runPostPaymentDelivery },
    "@/lib/supabase/service-role": { getSupabaseServiceRoleClient: () => { throw new Error("REAL_CLIENT_FORBIDDEN"); } } };
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    if (!(name in dependencies)) throw new Error("MOCK_UNEXPECTED_IMPORT"); return dependencies[name];
  }, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

export async function createMockShop({ backend, root }) {
  const service = createMockService(backend), supplier = await createMockSupplier();
  const capabilities = Object.fromEntries(["mock-customer", "mock-other", "mock-admin", "mock-webhook"].map((role) => [role, randomBytes(32).toString("hex")]));
  const bitrefill = createLocalBitrefillFulfillment({ transport: supplier.transport,
    loadPricing: async () => {
      const now = new Date().toISOString();
      return { product: mockProduct, productCheckedAt: now, quote: { source: "synthetic_fixture", synthetic: true,
        supplier: "bitrefill", quantity: 1, maxAllowedSpend: "5.00", checkedAt: now,
        expiresAt: new Date(Date.parse(now) + 240000).toISOString(), productId: "mock-gift-us", packageId: "mock-us-5",
        currency: "USD", amount: "4.80" } };
    },
    loadFinancialEvidence: async ({ order, orderItem }) => {
      const snapshot = await backend.read(), item = snapshot.order_items.find((r) => r.id === orderItem.id);
      return { source: "synthetic_paid_ledger", orderId: order.id, orderItemId: orderItem.id, currency: "USD",
        paidItemAmount: "6.00", paymentFee: "0.10", otherFees: "0", maxUnitProfit: "2.00", fxSource: "same_currency_no_conversion",
        paymentState: snapshot.ledger.some((r) => r.id === `debit:${order.id}`) ? "paid" : "unpaid",
        refundState: item.refunded ? "refunded" : "none", disputeState: "none" };
    }, loadSupplierBalance: async () => ({ source: "synthetic_balance", state: "sufficient", currency: "USD", availableAmount: "100.00" }) });
  const dispatch = (orderId) => dispatchLocalPaidSuppliers({ service, orderId, bitrefill });
  const entry = await loadActualLocalDeliveryEntry(root);
  const { payOrderWithBalance } = actualPaymentService(root, (client, orderId, trigger, onStage) =>
    entry.deliverDigitalOrder(client, orderId, trigger, onStage, bitrefill));
  let origin;
  const server = createServer(async (request, response) => {
    try {
      const role = Object.keys(capabilities).find((r) => capabilities[r] === request.headers["x-mock-session"]);
      if (!role) return mockJson(response, 401, { code: "MOCK_SESSION_REQUIRED" });
      if (request.headers.origin && request.headers.origin !== origin) return mockJson(response, 403, { code: "MOCK_ORIGIN_REJECTED" });
      const url = new URL(request.url, origin);
      const body = request.method === "POST" ? await readMockJson(request) : {};
      const state = await backend.read();
      const privateRoute = url.pathname.match(/^\/api\/orders\/(MOCK-[a-f0-9-]+)\/delivery$/);
      if (privateRoute && request.method === "GET") {
        const order = state.orders.find((r) => r.order_no === privateRoute[1] && r.user_id === role);
        if (!order || order.payment_status !== "paid") return mockJson(response, 404, { code: "MOCK_OWNER_REQUIRED" });
        return mockJson(response, 200, { status: order.status, deliveries: state.privateDeliveries
          .filter((r) => r.order_id === order.id && r.owner === role).map((r) => ({ id: r.id,
            product_name: "MOCK ONLY — synthetic gift", delivery_type: "auto_delivery", delivery_status: "delivered",
            content: r.content.code, masked_content: "••••••••", delivered_at: "2026-10-25T00:00:00Z", delivery_note: null })) });
      }
      const customerUi = url.pathname.match(/^\/customer\/([a-f0-9-]+)$/);
      if (customerUi && request.method === "GET") {
        const order = state.orders.find((r) => r.id === customerUi[1] && r.user_id === role);
        if (!order) return mockJson(response, 404, { code: "MOCK_OWNER_REQUIRED" });
        const { mockCustomerHtml } = await import("./bitrefill-mock-ui.mjs");
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        response.end(mockCustomerHtml(root, order)); return;
      }
      if (url.pathname === "/orders" && request.method === "POST" && ["mock-customer", "mock-other"].includes(role)) {
        return mockJson(response, 201, await service.createOrder(role, body.requestId, body.count));
      }
      if (url.pathname === "/webhook" && request.method === "POST" && role === "mock-webhook") {
        return mockJson(response, 200, await wakeLocalBitrefill({ service, transport: supplier.transport,
          event: body, dispatch }));
      }
      const match = url.pathname.match(/^\/orders\/([a-f0-9-]+)(?:\/(pay|cards|poll))?$/);
      if (match) {
        const order = state.orders.find((r) => r.id === match[1]);
        if (!order || order.user_id !== role) return mockJson(response, 404, { code: "MOCK_OWNER_REQUIRED" });
        if (request.method === "POST" && match[2] === "pay") return mockJson(response, 200,
          await payOrderWithBalance({ orderId: order.id, userId: role, clientRequestId: body.requestId }, service));
        if (request.method === "POST" && match[2] === "poll") return mockJson(response, 200, await dispatch(order.id));
        if (request.method === "GET" && match[2] === "cards") return mockJson(response, 200,
          { cards: state.privateDeliveries.filter((r) => r.order_id === order.id && r.owner === role).map((r) => ({ itemId: r.item_id, content: r.content })) });
        if (request.method === "GET" && !match[2]) return mockJson(response, 200, { order,
          items: state.order_items.filter((r) => r.order_id === order.id) });
      }
      if (url.pathname === "/admin/fulfillment" && request.method === "GET" && role === "mock-admin") {
        const { projectMockAdminRows } = await import("./bitrefill-mock-view.mjs");
        return mockJson(response, 200, { mode: "mock", rows: projectMockAdminRows(state) });
      }
      if (url.pathname === "/api/admin/suppliers/bitrefill/fulfillment" && request.method === "GET" && role === "mock-admin") {
        const { readBitrefillFulfillment } = await import("../../lib/admin/bitrefill-fulfillment.mjs");
        const { mockAdminReadClient } = await import("./bitrefill-mock-view.mjs");
        return mockJson(response, 200, await readBitrefillFulfillment(mockAdminReadClient(state), Number(url.searchParams.get("page") ?? 1)));
      }
      if (url.pathname === "/admin/ui" && request.method === "GET" && role === "mock-admin") {
        const { mockAdminHtml } = await import("./bitrefill-mock-ui.mjs");
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        response.end(mockAdminHtml(root)); return;
      }
      const refund = url.pathname.match(/^\/admin\/items\/([a-f0-9-]+)\/refund$/);
      if (refund && request.method === "POST" && role === "mock-admin") {
        // A refund is not inferred from webhook payload. Re-query both identities.
        const unit = state.supplier_purchase_attempt_items.find((r) => r.order_item_id === refund[1]);
        const child = state.supplier_external_orders.find((r) => r.attempt_item_id === unit?.id);
        const attempt = state.supplier_purchase_attempts.find((r) => r.id === unit?.attempt_id);
        if (!child || !attempt?.external_invoice_id) throw new Error("MOCK_REFUND_MANUAL_REVIEW");
        const invoice = await supplier.transport.readInvoice(attempt.external_invoice_id);
        const external = await supplier.transport.readOrder(child.external_order_id);
        if (invoice.id !== attempt.external_invoice_id || invoice.status !== "complete" || invoice.orders.length !== 1 ||
          invoice.orders[0].id !== external.id || invoice.orders[0].status !== "failed" ||
          external.id !== child.external_order_id || external.status !== "failed" || external.invoice_id !== invoice.id ||
          external.quantity !== 1 || external.product.id !== unit.frozen_product_id ||
          external.product.package_id !== unit.frozen_package_id || external.product.currency !== unit.frozen_currency ||
          decimalMicros(String(external.product.value)) !== decimalMicros(unit.frozen_face_value)) throw new Error("MOCK_REFUND_MANUAL_REVIEW");
        return mockJson(response, 200, await service.refundFailedItem(refund[1]));
      }
      mockJson(response, 404, { code: "MOCK_ROUTE_NOT_AVAILABLE" });
    } catch { mockJson(response, 409, { code: "MOCK_OPERATION_REQUIRES_REVIEW" }); }
  });
  origin = await listenMock(server);
  return { origin, service, supplier, dispatch, capabilities, async close() { await closeMock(server); await supplier.close(); } };
}
