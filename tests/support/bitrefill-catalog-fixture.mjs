import { parseBitrefillProduct } from "../../lib/providers/bitrefill/protocol.mjs";
import { createBitrefillCatalogManager } from "../../lib/providers/bitrefill/catalog-management.mjs";
export function catalogFixture() {
  const raw = [
    { id: "mock-apple-us", name: "MOCK Apple US", packages: [{ package_id: "mock-apple-us<&>5", value: 5, price: 12345 }] },
    { id: "mock-amazon-us", name: "MOCK Amazon US", packages: [{ package_id: "mock-amazon-10", value: 10 }], range: { min: 5, max: 100, step: 0.5 } },
    { id: "mock-range-us", name: "MOCK Range US", packages: [], range: { min: 0.1, max: 100, step: 0.1 } },
    { id: "mock-many-us", name: "MOCK 296 Packages", packages: Array.from({ length: 296 }, (_, i) => ({ package_id: `mock-${i + 1}`, value: i + 1 })) },
    ...Array.from({ length: 24 }, (_, i) => ({ id: `mock-other-${i}`, name: `MOCK Other ${i}`, type: "mobile_refill", in_stock: i % 2 === 0, packages: [{ package_id: `mock-other-${i}-5`, value: 5 }] })),
  ].map((p) => ({ country: "US", currency: "USD", type: "gift_card", in_stock: true, ...p }));
  raw.push({ ...raw[0], id: "mock-apple-ca", name: "MOCK Apple CA", country: "CA", currency: "CAD" });
  const products = raw.map((p) => { const parsed = parseBitrefillProduct(p); if (!parsed) throw Error("MOCK_CATALOG_INVALID"); return parsed; });
  const calls = [];
  const client = {
    async searchProducts(query, options) { calls.push({ method: "GET", kind: "search", query });
      const matches = products.filter((p) => `${p.id} ${p.name}`.toLowerCase().includes(query.toLowerCase()));
      return { products: structuredClone(matches.slice(options.start, options.start + options.limit)),
        meta: { start: options.start, limit: options.limit, totalResults: matches.length, next: null } }; },
    async listProductsBounded(options) { calls.push({ method: "GET", kind: "catalog", country: options.country });
      return { products: structuredClone(products.filter((p) => p.country === options.country)), pagesRead: 1, truncated: false }; },
    async getProduct(id) { calls.push({ method: "GET", kind: "product", id }); const product = products.find((p) => p.id === id); if (!product) throw Error("PRODUCT_NOT_FOUND"); return { product: structuredClone(product) }; },
  };
  return { catalog: createBitrefillCatalogManager(client), products, raw, calls, client };
}
export function syntheticAftercareState() {
  return { orders: [{ id: "mock-order-partial", order_no: "MOCK-PARTIAL" }, { id: "mock-order-refunded", order_no: "MOCK-REFUNDED" }],
    supplier_fulfillment_requests: [
      { id: "mock-root-a", order_id: "mock-order-partial", order_item_id: "mock-item-a", supplier: "bitrefill", status: "FULFILLED" },
      { id: "mock-root-b", order_id: "mock-order-partial", order_item_id: "mock-item-b", supplier: "bitrefill", status: "FAILED" },
      { id: "mock-root-c", order_id: "mock-order-refunded", order_item_id: "mock-item-c", supplier: "bitrefill", status: "NEEDS_INPUT" },
      { id: "mock-root-daju", order_id: "mock-order-daju", supplier: "daju", status: "FAILED" }],
    supplier_purchase_attempt_items: [
      { id: "mock-unit-a", attempt_id: "mock-attempt-a", fulfillment_request_id: "mock-root-a" },
      { id: "mock-unit-b", attempt_id: "mock-attempt-b", fulfillment_request_id: "mock-root-b" },
      { id: "mock-unit-c", attempt_id: "mock-attempt-c", fulfillment_request_id: "mock-root-c" }],
    supplier_purchase_attempts: ["a", "b", "c"].map((n) => ({ id: `mock-attempt-${n}`, status: "RECONCILED", external_invoice_id: `mock-invoice-${n}` })),
    supplier_external_orders: ["DELIVERED", "FAILED", "REFUNDED"].map((status, i) => ({ attempt_id: `mock-attempt-${"abc"[i]}`, attempt_item_id: `mock-unit-${"abc"[i]}`, normalized_status: status })),
    ledger: [], balances: { "mock-owner": 100 }, privateDeliveries: [], receipts: [] };
}
