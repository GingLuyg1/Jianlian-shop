// Explicit loopback mock; never accepts credentials or a configurable remote URL.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { BitrefillFakeTransport, BitrefillTransportError } from "../../lib/providers/bitrefill/transport.mjs";
import { buildBitrefillBalanceInvoiceBody } from "../../lib/providers/bitrefill/purchase-http-transport.mjs";
import { prepareBitrefillBusinessBalancePayment } from "../../lib/providers/bitrefill/business-adapter.mjs";

export async function readMockJson(request) {
  let bytes = 0, body = "";
  for await (const chunk of request) { bytes += chunk.length; if (bytes > 16384) throw new Error("MOCK_BODY_LIMIT"); body += chunk; }
  return body ? JSON.parse(body) : {};
}
export function mockJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff" }); response.end(JSON.stringify(body));
}
export async function listenMock(server) {
  server.requestTimeout = 5000; server.headersTimeout = 5000;
  await new Promise((ok, fail) => { server.once("error", fail); server.listen(0, "127.0.0.1", ok); });
  return `http://127.0.0.1:${server.address().port}`;
}
export async function closeMock(server) {
  server.closeAllConnections(); await new Promise((ok) => server.close(ok));
}

export async function createMockSupplier() {
  const invoices = new Map(), children = new Map(), modes = [], calls = [];
  const paid = new Set(); // Synthetic supplier ledger: one debit per invoice.
  function advance(invoiceId, statuses) {
    const invoice = invoices.get(invoiceId);
    if (!invoice || !Array.isArray(statuses) || statuses.length !== invoice.orders.length ||
      statuses.some((s) => !["created", "payment_detected", "processing", "delivered", "failed"].includes(s))) throw new Error("MOCK_ADVANCE_INVALID");
    invoice.orders.forEach((ref, n) => {
      const child = children.get(ref.id);
      // No backward transitions; webhook payload cannot undo supplier terminal state.
      if (["delivered", "failed"].includes(child.status)) return;
      child.status = ref.status = statuses[n];
      if (child.status === "delivered") child.redemption_info = { code: `MOCK-CARD-${child.id}` };
    });
    // Compute from applied child state, not a rejected delayed transition.
    invoice.status = invoice.orders.every((ref) => ["delivered", "failed"].includes(ref.status)) ? "complete" : "pending";
  }
  function payInvoice(invoice) {
    if (paid.has(invoice.id)) return;
    paid.add(invoice.id);
    advance(invoice.id, invoice.orders.map((_, n) => invoice.mode === "delivered" || invoice.mode === "partial" && n === 0 ? "delivered" : invoice.mode === "failed" || invoice.mode === "partial" ? "failed" : "processing"));
  }
  const server = createServer(async (request, response) => {
    try {
      if (request.headers.authorization) return mockJson(response, 400, { error: "MOCK_CREDENTIALS_FORBIDDEN" });
      const path = new URL(request.url, "http://127.0.0.1").pathname;
      calls.push({ method: request.method, path }); // Never log body or redemption data.
      if (request.method === "POST" && path === "/invoices") {
        const body = await readMockJson(request);
        if (!Array.isArray(body.products) || body.products.length < 1 || body.products.length > 20 ||
          body.products.some((p) => p.product_id !== "mock-gift-us" || p.package_id !== "mock-us-5" || !Number.isInteger(p.quantity) || p.quantity < 1 || p.quantity > 20)) throw new Error("MOCK_PRODUCTS_INVALID");
        if (body.products.reduce((sum, p) => sum + p.quantity, 0) > 20) throw new Error("MOCK_UNIT_LIMIT");
        const mode = modes.shift() ?? "pending", invoiceId = `mock-invoice-${randomUUID()}`;
        const invoice = { id: invoiceId, status: "unpaid", orders: [] };
        let index = 0;
        for (const p of body.products) for (let n = 0; n < p.quantity; n++) {
          index++;
          const child = { id: `mock-child-${randomUUID()}`, invoice_id: invoiceId, status: "created", quantity: 1,
            client_reference: body.mock_references?.[index - 1], product: { id: mode === "wrong" ? "wrong-product" : p.product_id,
              package_id: p.package_id, value: 5, currency: "USD" } };
          children.set(child.id, child); invoice.orders.push({ id: child.id, status: child.status, client_reference: child.client_reference });
        }
        invoice.mode = mode; invoices.set(invoiceId, invoice);
        if (body.auto_pay === true) payInvoice(invoice);
        if (mode === "timeout") { request.socket.destroy(); return; }
        return mockJson(response, 200, { data: { id: invoiceId, status: invoice.status } });
      }
      const pay = path.match(/^\/invoices\/(mock-invoice-[a-f0-9-]+)\/pay$/);
      if (request.method === "POST" && pay) {
        const invoice = invoices.get(pay[1]); if (!invoice) return mockJson(response, 404, { error: "MOCK_NOT_FOUND" });
        const body = await readMockJson(request); if (Object.keys(body).length) throw new Error("MOCK_PAYMENT_INVALID");
        payInvoice(invoice);
        return mockJson(response, 200, { data: { id: invoice.id, status: invoice.status } });
      }
      const invoiceMatch = path.match(/^\/invoices\/(mock-invoice-[a-f0-9-]+)$/);
      if (request.method === "GET" && invoiceMatch && invoices.has(invoiceMatch[1])) {
        const invoice = structuredClone(invoices.get(invoiceMatch[1]));
        delete invoice.mode; invoice.orders.reverse(); // Identity mapping must not rely on array order.
        return mockJson(response, 200, { data: invoice });
      }
      const childMatch = path.match(/^\/orders\/(mock-child-[a-f0-9-]+)$/);
      if (request.method === "GET" && childMatch && children.has(childMatch[1])) return mockJson(response, 200, { data: children.get(childMatch[1]) });
      return mockJson(response, 404, { error: "MOCK_NOT_FOUND" });
    } catch { mockJson(response, 400, { error: "MOCK_REQUEST_REJECTED" }); }
  });
  const origin = await listenMock(server);
  const request = async (method, path, body) => {
    // Path is generated internally, not provided by a browser or supplier response.
    const response = await fetch(`${origin}${path}`, { method, redirect: "error", signal: AbortSignal.timeout(3000),
      headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new BitrefillTransportError("MOCK_HTTP_ERROR", { submitted: method === "POST" });
    return (await response.json()).data;
  };
  class MockHttpTransport extends BitrefillFakeTransport {
    async createInvoice(input) {
      this.invoiceSubmissions++;
      // Single-item path shares the real adapter's pure request contract. Mock batch
      // uses the already-tested offline group contract, NEVER the real transport.
      const body = input.products.length === 1 && input.products[0].quantity === 1 ? buildBitrefillBalanceInvoiceBody(input) : { ...input, payment_method: "balance", auto_pay: true };
      const refs = await this.references?.();
      const invoice = await request("POST", "/invoices", { ...body, ...(refs ? { mock_references: refs } : {}) });
      return invoice;
    }
    async readInvoice(value) { this.invoiceReads++; return request("GET", `/invoices/${encodeURIComponent(value)}`); }
    async readOrder(value) { this.orderReads++; return request("GET", `/orders/${encodeURIComponent(value)}`); }
    async payInvoice(value) { const payment = prepareBitrefillBusinessBalancePayment(value); return request(payment.method, payment.path, payment.body); }
  }
  return { origin, calls, invoices, children, modes, paid, advance, transport: new MockHttpTransport(), close: () => closeMock(server) };
}
