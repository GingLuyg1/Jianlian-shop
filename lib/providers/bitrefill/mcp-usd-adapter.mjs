// Preparation only: no production registry/Worker/persistence changes. Reuse the
// established frozen SKU/product/cost/order checks and never submit buy-products.
import { createHash } from "node:crypto";
import { createBitrefillMcpReadonlyClient } from "./mcp-readonly-client.mjs";
import { prepareBitrefillSingleItem } from "./single-item-purchase.mjs";
import { decimalMicros } from "./quote-core.mjs";

const fail = code => { throw new Error(`BITREFILL_MCP_${code}`); };
function recent(when, nowMs, ttl) {
  const at = Date.parse(when); return Number.isFinite(at) && at <= nowMs && nowMs - at <= ttl;
}

export function prepareBitrefillMcpUsdPurchase({ candidate, contract, balances, nowMs = Date.now() }) {
  if (contract?.source !== "authenticated_mcp_tools_list" || !recent(contract.checkedAt, nowMs, 300000) ||
      !/^[a-f0-9]{64}$/.test(contract.accountFingerprint ?? "")) fail("LIVE_CONTRACT_REQUIRED");
  const tool = contract.tools?.find(tool => tool.name === "buy-products"), schema = tool?.inputSchema;
  if (tool?.annotations?.destructiveHint !== true ||
      !schema?.required?.includes("cart_items") || !schema.required.includes("payment_method") ||
      !schema.properties?.payment_method?.enum?.includes("balance") ||
      !schema.properties?.balance_currency?.enum?.includes("USD") ||
      schema.properties?.cart_items?.items?.properties?.package_value?.type !== "string") fail("USD_CONTRACT_REQUIRED");
  if (balances?.source !== "authenticated_mcp_balances" || balances.accountFingerprint !== contract.accountFingerprint ||
      !recent(balances.checkedAt, nowMs, 60000)) fail("FRESH_SAME_ACCOUNT_BALANCE_REQUIRED");
  const usd = balances.balances?.filter(wallet => wallet.paymentMethod === "balance" && wallet.currency === "USD");
  if (!Array.isArray(usd) || usd.length !== 1 || usd[0].decimals !== 2) fail("USD_BALANCE_REQUIRED");
  const quote = candidate?.quote;
  if (quote?.currency !== "USD" || quote.feesIncluded !== true || quote.accountFingerprint !== contract.accountFingerprint) fail("USD_COST_AND_IDENTITY_REQUIRED");
  // This unchanged established guard rejects unpaid orders, mutable bindings,
  // package drift, stale/untrusted quotes, currency mismatch, caps and bad profit.
  // CNY orders are NOT converted using an invented FX rate.
  const prepared = prepareBitrefillSingleItem({ ...candidate, nowMs });
  if (decimalMicros(usd[0].availableAmount) < decimalMicros(quote.amount)) fail("USD_BALANCE_INSUFFICIENT");
  const { binding } = prepared.item;
  // Preserve the exact MCP denomination supplied by the future pricing/details
  // evidence instead of guessing it from the REST Package ID or face formatting.
  if (typeof quote.mcpPackageValue !== "string" ||
      decimalMicros(quote.mcpPackageValue) !== decimalMicros(binding.faceValue)) fail("PACKAGE_VALUE_REQUIRED");
  return Object.freeze({
    status: "PREPARED_NOT_SUBMITTED", logicalKeyPrefix: prepared.logicalKeyPrefix,
    accountFingerprint: contract.accountFingerprint,
    requiresExistingPersistence: true, requiresSingleChildReconciliation: true,
    request: Object.freeze({ method: "tools/call", params: Object.freeze({ name: "buy-products", arguments: Object.freeze({
      cart_items: Object.freeze([Object.freeze({ product_id: binding.productId, package_value: quote.mcpPackageValue })]),
      payment_method: "balance", balance_currency: "USD", return_payment_link: false,
    }) }) }),
  });
}

export function createBitrefillMcpUsdAdapter(options = {}) {
  const client = createBitrefillMcpReadonlyClient(options);
  const identity = createHash("sha256").update("bitrefill-personal-key-v1:").update(options.credentials.apiKey.trim()).digest("hex");
  return Object.freeze({ authMode: "personal", purchaseEnabled: false, walletCurrency: "USD",
    listTools: client.listTools, readBalances: client.readBalances,
    preparePurchase(args) {
      if (args?.contract?.accountFingerprint !== identity || args?.balances?.accountFingerprint !== identity) fail("ADAPTER_ACCOUNT_MISMATCH");
      return prepareBitrefillMcpUsdPurchase(args);
    },
    async createInvoice() { fail("REAL_PURCHASE_DISABLED"); },
    // MCP balance purchases auto-debit. Never follow with REST /invoices/:id/pay.
    async payInvoice() { fail("SEPARATE_PAYMENT_FORBIDDEN"); },
  });
}
