import { createBitrefillClient } from "./client-core.mjs";

export class BitrefillTransportError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = "BitrefillTransportError";
    this.code = code;
    this.kind = details.kind ?? "safety";
    this.submitted = details.submitted === true;
  }
}

function blockWrite(method) {
  const normalized = String(method ?? "").toUpperCase();
  if (normalized !== "GET") {
    throw new BitrefillTransportError("READ_ONLY_MODE_METHOD_BLOCKED");
  }
}

export class BitrefillHttpTransport {
  constructor(input) {
    this.kind = "http";
    this.readOnlyMode = true;
    this.client = createBitrefillClient(input);
  }

  request(method, operation, input) {
    blockWrite(method);
    if (operation === "catalog") return this.client.listProductsBounded(input);
    if (operation === "product") return this.client.getProduct(input?.productId);
    if (operation === "search") return this.client.searchProducts(input?.query, input);
    if (operation === "ping") return this.client.ping();
    throw new BitrefillTransportError("READ_ONLY_OPERATION_NOT_ALLOWED");
  }

  readCatalog(input) { return this.request("GET", "catalog", input); }
  readProduct(productId) { return this.request("GET", "product", { productId }); }
  searchProducts(query, input = {}) { return this.request("GET", "search", { ...input, query }); }
  ping() { return this.request("GET", "ping"); }
  createInvoice(input) { return this.request("POST", "invoice", input); }
}

function cloneFixture(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export class BitrefillFakeTransport {
  constructor(fixtures = {}) {
    this.kind = "fake";
    this.readOnlyMode = false;
    this.fixtures = cloneFixture(fixtures);
    this.invoiceSubmissions = 0;
    this.invoiceReads = 0;
    this.orderReads = 0;
  }

  async readCatalog() {
    if (this.fixtures.catalogError) throw this.fixtures.catalogError;
    return cloneFixture(this.fixtures.catalog ?? { products: [], pagesRead: 1, truncated: false });
  }

  async readProduct(productId) {
    const product = this.fixtures.products?.[productId];
    if (!product) throw new BitrefillTransportError("PRODUCT_NOT_FOUND", { kind: "fixture" });
    return { product: cloneFixture(product), status: 200, rateLimit: null };
  }

  async createInvoice(request) {
    this.invoiceSubmissions += 1;
    if (this.fixtures.submitTimeoutAfterAccept === true) {
      throw new BitrefillTransportError("POST_SUBMIT_TIMEOUT", { kind: "transport", submitted: true });
    }
    if (this.fixtures.invoiceError) throw this.fixtures.invoiceError;
    return cloneFixture(this.fixtures.invoice ?? {
      id: "fixture-invoice",
      status: "pending",
      orders: [],
      request,
    });
  }

  async readInvoice() {
    this.invoiceReads += 1;
    return cloneFixture(this.fixtures.reconciledInvoice ?? this.fixtures.invoice);
  }

  async readOrder(orderId) {
    this.orderReads += 1;
    const order = this.fixtures.orders?.[orderId];
    if (!order) throw new BitrefillTransportError("ORDER_NOT_FOUND", { kind: "fixture" });
    return cloneFixture(order);
  }
}
