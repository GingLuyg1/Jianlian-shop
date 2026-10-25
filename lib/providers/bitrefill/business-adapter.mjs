// Business-only construction boundary. No implicit Personal fallback, no env
// reads, no invented credentials, no activation capability. Transport stays shut.
import { BitrefillPurchaseHttpTransport, buildBitrefillBalanceInvoiceBody } from "./purchase-http-transport.mjs";

export function prepareBitrefillBusinessPurchase(request, contract) {
  if (!contract || contract.approved !== true || typeof contract.reference !== "string" || !contract.reference.trim() ||
      contract.paymentMethod !== "balance" || contract.invoiceStrategy !== "single_item" ||
      !["auto_pay", "separate_payment"].includes(contract.paymentFlow)) throw new Error("BITREFILL_BUSINESS_CONTRACT_REQUIRED");
  const body = buildBitrefillBalanceInvoiceBody(request);
  return { ...body, auto_pay: contract.paymentFlow === "auto_pay" };
}

export function prepareBitrefillBusinessBalancePayment(invoiceId) {
  if (typeof invoiceId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(invoiceId)) {
    throw new Error("BITREFILL_EXTERNAL_ID_INVALID");
  }
  // Official separate balance-payment endpoint accepts an empty JSON body.
  return { method: "POST", path: `/invoices/${encodeURIComponent(invoiceId)}/pay`, body: {} };
}

export function createBitrefillBusinessAdapter({ credentials, fetchImpl, timeoutMs } = {}) {
  if (credentials?.authMode !== "business" || !credentials.apiId || !credentials.apiSecret || credentials.apiKey) {
    throw new Error("BITREFILL_BUSINESS_CREDENTIALS_REQUIRED");
  }
  const transport = new BitrefillPurchaseHttpTransport({ authMode: "business", apiId: credentials.apiId,
    apiSecret: credentials.apiSecret, fetchImpl, timeoutMs, purchaseEnabled: false });
  return Object.freeze({ authMode: "business", purchaseEnabled: false,
    readInvoice: (id) => transport.readInvoice(id), readOrder: (id) => transport.readOrder(id),
    readProduct: (id) => transport.readProduct(id),
    // Contract preparation cannot enable a POST. Enabling/validating a real
    // separate-payment workflow remains a separately authorized integration task.
    async createInvoice(request, contract) {
      const body = prepareBitrefillBusinessPurchase(request, contract);
      return transport.createInvoice(body, { autoPay: body.auto_pay });
    }, async payInvoice(invoiceId) {
      prepareBitrefillBusinessBalancePayment(invoiceId);
      return transport.payInvoice(invoiceId);
    } });
}
