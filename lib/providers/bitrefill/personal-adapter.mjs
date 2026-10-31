// Server-side integration dependency only. No route/registry/worker enables it.
// Reuse the existing transport and the same compile-time purchasing gate.
import { createBitrefillClient } from "./client-core.mjs";
import { BitrefillPurchaseHttpTransport } from "./purchase-http-transport.mjs";

export function normalizeBitrefillAccountBalance(data, checkedAt = new Date().toISOString()) {
  if (!data || typeof data !== "object" || Array.isArray(data) || !/^[A-Z]{3,8}$/.test(data.currency ?? "")) {
    throw new Error("BITREFILL_BALANCE_RESPONSE_INVALID");
  }
  let amount = typeof data.balance === "number" && Number.isFinite(data.balance)
    ? String(data.balance) : data.balance;
  // Expand JSON numbers such as 1e-8 lexically; do not round a satoshi to zero.
  if (typeof data.balance === "number" && /^\d+(?:\.\d+)?e-\d+$/.test(amount)) {
    const [mantissa, exponent] = amount.split("e-");
    const [whole, fraction = ""] = mantissa.split(".");
    const zeros = Number(exponent) - whole.length;
    if (zeros < 0 || zeros > 17) throw new Error("BITREFILL_BALANCE_RESPONSE_INVALID");
    amount = `0.${"0".repeat(zeros)}${whole}${fraction}`;
  }
  if (typeof amount !== "string" || !/^(0|[1-9]\d{0,11})(?:\.\d{1,18})?$/.test(amount) ||
      typeof checkedAt !== "string" || !Number.isFinite(Date.parse(checkedAt))) {
    throw new Error("BITREFILL_BALANCE_RESPONSE_INVALID");
  }
  return Object.freeze({ availableAmount: amount, currency: data.currency,
    checkedAt, source: "authenticated_account_balance", purchasePermission: "unverified" });
}

export function createBitrefillPersonalAdapter({ credentials, fetchImpl, timeoutMs } = {}) {
  if (credentials?.authMode !== "personal" || !credentials.apiKey || credentials.apiId || credentials.apiSecret) {
    throw new Error("BITREFILL_PERSONAL_CREDENTIALS_REQUIRED");
  }
  const transport = new BitrefillPurchaseHttpTransport({ authMode: "personal", apiKey: credentials.apiKey,
    fetchImpl, timeoutMs, purchaseEnabled: false });
  const catalog = createBitrefillClient({ authMode: "personal", apiKey: credentials.apiKey,
    fetchImpl, timeoutMs, maxRetries: 0 });
  return Object.freeze({ authMode: "personal", purchaseEnabled: false,
    ping: () => catalog.ping(),
    readCatalog: (options) => catalog.listProducts(options),
    readProduct: (id) => transport.readProduct(id),
    readBalance: async () => normalizeBitrefillAccountBalance(await transport.readBalance()),
    // Callers must use only already-known, owned IDs. Never enumerate for codes.
    readInvoice: (id) => transport.readInvoice(id),
    readOrder: (id) => transport.readOrder(id),
    // Both fail before fetch. No permission object or factory flag can unlock POST.
    createInvoice: (request) => transport.createInvoice(request),
    payInvoice: (id) => transport.payInvoice(id),
  });
}
