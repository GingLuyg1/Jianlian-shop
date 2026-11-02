import { randomUUID } from "node:crypto";
import { BitrefillFakeTransport } from "../../lib/providers/bitrefill/transport.mjs";

export function pinFixture(face = "10") {
  const id = randomUUID(), itemId = randomUUID(), skuId = randomUUID(), productId = randomUUID();
  const now = new Date().toISOString(), expiresAt = new Date(Date.now() + 240000).toISOString();
  const values = { "10": ["13.40", "15", "110.00"], "15": ["20.10", "22", "170.00"], "20": ["26.79", "28", "220.00"] };
  const [amount, cap, sale] = values[face];
  const binding = { fulfillment_source: "supplier", supplier: "bitrefill", supplier_product_id: "giff-gaff-pin-united-kingdom",
    supplier_sku: `giff-gaff-pin-united-kingdom<&>${face}`, supplier_currency: "GBP", supplier_country: "GB",
    supplier_face_value: face, supplier_cost_currency: "USD", supplier_delivery_kind: "pin",
    supplier_max_unit_cost: cap, supplier_min_unit_profit: "1.00" };
  const candidate = { order: { id, user_id: randomUUID(), status: "paid", payment_status: "paid", currency: "CNY" },
    orderItem: { id: itemId, order_id: id, sku_id: skuId, product_id: productId, quantity: 1, unit_price: sale,
      delivery_type: "auto_delivery", delivery_status: "pending", product_snapshot: { supplier_binding: binding } },
    root: { id: randomUUID(), order_id: id, order_item_id: itemId, supplier: "bitrefill", supplier_product_id: binding.supplier_product_id,
      supplier_sku: binding.supplier_sku, status: "PURCHASING", request_id: `jianlian:${id}:${itemId}`, attempt_token: randomUUID() } };
  const quote = { source: "synthetic_fixture", quoteId: `fixture:${itemId}`, accountFingerprint: "a".repeat(64),
    productId: binding.supplier_product_id, packageId: binding.supplier_sku, currency: "USD", allInUsd: amount,
    feesIncluded: true, supplierEnforcedDebitCap: true, checkedAt: now, expiresAt };
  const pricing = { productCheckedAt: now, quote, catalogRaw: { id: binding.supplier_product_id, name: "SYNTHETIC Giffgaff PIN",
    country_code: "GB", currency: "GBP", recipient_type: "none", categories: ["refill", "pin"], in_stock: true,
    packages: ["10", "15", "20"].map(value => ({ id: `giff-gaff-pin-united-kingdom<&>${value}`, value, price: 1 })) } };
  const financial = { source: "synthetic_paid_ledger", orderId: id, orderItemId: itemId, currency: "CNY", paymentState: "paid",
    paidItemAmount: sale, refundState: "none", disputeState: "none", resaleScopeApproved: true, businessCredentialsVerified: true,
    typedFulfillmentVerified: true, authoritativeReconciliationVerified: true, atomicBudgetReservationReady: true,
    boundedSpendAuthorized: true, cumulativeCapUsd: "100", authorizationReference: "SYNTHETIC_PIN_TEST_ONLY",
    additionalCnyCost: "0.10", additionalCnyCostsVerified: true,
    fx: { approvedSettlementSource: true, from: "USD", to: "CNY", rate: "6.70", checkedAt: now, expiresAt } };
  const balance = { source: "synthetic_supplier_balance", currency: "USD", accountFingerprint: "a".repeat(64),
    availableAmount: "100", reservedUsd: "0", spentUsd: "0", checkedAt: now };
  return { candidate, pricing, financial, balance };
}

export class PinFakeTransport extends BitrefillFakeTransport {
  constructor(fixture, mode = "delivered") { super();this.scenario = fixture;this.mode = mode;this.invoices = new Map();this.children = new Map(); }
  async createInvoice(request) {
    this.invoiceSubmissions++;
    if (this.mode === "timeout") { const e = Error("SYNTHETIC_ACCEPTED_TIMEOUT");e.submitted = true;throw e; }
    const id = `pin-invoice-${randomUUID()}`, childId = `pin-child-${randomUUID()}`;
    const pending = this.mode === "processing", failed = this.mode === "failed";
    const status = pending ? "processing" : failed ? "failed" : "delivered";
    const binding = this.scenario.candidate.orderItem.product_snapshot.supplier_binding;
    const child = { id: childId, invoice_id: id, quantity: 1, status,
      product: { id: this.mode === "wrong" ? "wrong-product" : request.products[0].product_id,
        package_id: request.products[0].package_id, value: binding.supplier_face_value, currency: "GBP" },
      ...(status === "delivered" && this.mode !== "missing_pin" ? { redemption_info: {
        pin: "SYNTHETIC_PRIVATE_PIN_1234", instructions: "SYNTHETIC dial operator voucher service" } } : {}) };
    this.children.set(childId, child);this.invoices.set(id, { id, status: pending ? "pending" : "complete", orders: [{ id: childId, status }] });
    return { id, status: "pending", orders: [] };
  }
  async readInvoice(id) { this.invoiceReads++;return structuredClone(this.invoices.get(id)); }
  async readOrder(id) { this.orderReads++;return structuredClone(this.children.get(id)); }
  complete() { for (const [id,c] of this.children) { c.status = "delivered";c.redemption_info = { pin: "SYNTHETIC_PRIVATE_PIN_1234" }; }
    for (const [id,i] of this.invoices) { i.status = "complete";i.orders.forEach(c => c.status = "delivered"); } }
}
