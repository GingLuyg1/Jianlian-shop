// PIN-only server policy, shared with the existing DB9 workflow. Never enables
// HTTP or accepts customer-supplied payment/price assertions.
import { createHash } from "node:crypto";
import { BitrefillFakeTransport } from "./transport.mjs";
import { BitrefillPurchaseHttpTransport } from "./purchase-http-transport.mjs";
import { assertBitrefillRealPurchaseEnabled } from "./prelaunch-policy.mjs";
import { parseBitrefillProduct } from "./protocol.mjs";
import { normalizeBitrefillProduct, buildBitrefillInvoiceRequest } from "./provider-core.mjs";
import { validateBitrefillFrozenItem } from "./single-item-purchase.mjs";
import { evaluateBitrefillDirectSale } from "./direct-sales-policy.mjs";
import { decimalMicros } from "./quote-core.mjs";
import { mappingMoney } from "./mapping-financials.mjs";

const preparedTokens = new WeakMap();
const fail = code => { throw Error(`BITREFILL_PIN_${code}`); };
const freeze = x => { if (x && typeof x === "object") { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
export function assertPinTransport(transport) {
  if (transport instanceof BitrefillFakeTransport) return true;
  assertBitrefillRealPurchaseEnabled();
  if (!(transport instanceof BitrefillPurchaseHttpTransport) || !transport.purchaseEnabled) fail("HTTP_RELEASE_REQUIRED");
  return false;
}
export function assertPinPaidEvidence(evidence, candidate, synthetic) {
  if (evidence?.source !== (synthetic ? "synthetic_paid_ledger" : "authenticated_paid_ledger") ||
      evidence.orderId !== candidate.order.id || evidence.orderItemId !== candidate.orderItem.id ||
      evidence.currency !== "CNY" || candidate.order.currency !== "CNY" || evidence.paymentState !== "paid" ||
      evidence.refundState !== "none" || evidence.disputeState !== "none") fail("PAID_LEDGER_REQUIRED");
  const paid = decimalMicros(evidence.paidItemAmount), sale = decimalMicros(String(candidate.orderItem.unit_price));
  if (paid <= 0n || paid > sale) fail("PAID_ALLOCATION_INVALID");
}

export function prepareBitrefillPinPurchase({ transport, candidate, pricing, financial, balance, nowMs = Date.now() }) {
  const synthetic = assertPinTransport(transport);
  assertPinPaidEvidence(financial, candidate, synthetic);
  const raw = pricing.catalogRaw;
  if (raw?.recipient_type !== "none" || raw.id !== candidate.orderItem.product_snapshot?.supplier_binding?.supplier_product_id) fail("PIN_PRODUCT_REQUIRED");
  const parsed = parseBitrefillProduct(raw);
  if (!parsed) fail("CATALOG_INVALID");
  const product = normalizeBitrefillProduct(parsed);
  const { frozen } = validateBitrefillFrozenItem({ ...candidate, product, productCheckedAt: pricing.productCheckedAt, nowMs });
  if (frozen.supplier_cost_currency !== "USD" || frozen.supplier_delivery_kind !== "pin" ||
      frozen.supplier_country !== parsed.country) fail("FROZEN_PIN_CURRENCY_COUNTRY_REQUIRED");
  const quote = pricing.quote, cap = frozen.supplier_max_unit_cost;
  if (quote?.source !== (synthetic ? "synthetic_fixture" : "authenticated_supplier_cost") ||
      typeof quote.quoteId !== "string" || !/^[A-Za-z0-9:_-]{1,190}$/.test(quote.quoteId) ||
      !/^[a-f0-9]{64}$/.test(quote.accountFingerprint ?? "") || quote.currency !== "USD" ||
      decimalMicros(quote.allInUsd) > decimalMicros(cap)) fail("COST_CONTRACT_REQUIRED");
  if (balance?.source !== (synthetic ? "synthetic_supplier_balance" : "authenticated_supplier_balance") ||
      balance.currency !== "USD" || balance.accountFingerprint !== quote.accountFingerprint ||
      !Number.isFinite(Date.parse(balance.checkedAt)) || Date.parse(balance.checkedAt) > nowMs ||
      nowMs - Date.parse(balance.checkedAt) > 60000) fail("BALANCE_REQUIRED");
  const facts = { ...financial, supplier: "bitrefill", productId: frozen.supplier_product_id,
    packageId: frozen.supplier_sku, salePriceCny: financial.paidItemAmount,
    upstreamAvailable: parsed.inStock, balanceUsd: balance.availableAmount,
    singleCapUsd: cap, reservedUsd: balance.reservedUsd, spentUsd: balance.spentUsd,
    quote: { ...quote, source: "authenticated_supplier_cost" } };
  // Synthetic fixtures use the same arithmetic; their issuer stays explicitly
  // synthetic in the durable semantic context. Only FakeTransport may omit the
  // immutable Production release blocker, never a caller-controlled boolean.
  const decision = evaluateBitrefillDirectSale(facts, nowMs);
  const reasons = decision.reasons.filter(r => !(synthetic && r === "PRODUCTION_PURCHASE_RELEASE_DISABLED"));
  if (reasons.length) fail(reasons[0]);
  const cnyScale = 100000000n;
  const netProfit = mappingMoney(financial.paidItemAmount) * cnyScale -
    mappingMoney(quote.allInUsd) * mappingMoney(financial.fx.rate) - mappingMoney(financial.additionalCnyCost) * cnyScale;
  if (netProfit < mappingMoney(frozen.supplier_min_unit_profit) * cnyScale) fail("FROZEN_MINIMUM_PROFIT");
  const context = { version: "pin-cny-usd-v1", synthetic, orderId: candidate.order.id,
    orderItemId: candidate.orderItem.id, skuId: candidate.orderItem.sku_id,
    productId: frozen.supplier_product_id, packageId: frozen.supplier_sku,
    faceCurrency: frozen.supplier_currency, faceValue: frozen.supplier_face_value,
    costCurrency: "USD", quoteId: quote.quoteId, allInUsd: quote.allInUsd,
    paidCny: financial.paidItemAmount, usdCny: financial.fx.rate,
    additionalCnyCost: financial.additionalCnyCost, costCapUsd: cap,
    cumulativeCapUsd: financial.cumulativeCapUsd, accountFingerprint: quote.accountFingerprint,
    authorizationReference: financial.authorizationReference, rootId: candidate.root.id,
    requestId: candidate.root.request_id, attemptToken: candidate.root.attempt_token,
    minimumProfitCny: frozen.supplier_min_unit_profit,
    bindingFingerprint: createHash("sha256").update(JSON.stringify(frozen)).digest("hex") };
  if (typeof context.authorizationReference !== "string" || !/^[A-Za-z0-9:_-]{1,190}$/.test(context.authorizationReference)) fail("AUTHORIZATION_REFERENCE_REQUIRED");
  const item = { orderItemId: candidate.orderItem.id, fulfillmentRequestId: candidate.root.id,
    quantity: 1, binding: { supplier: "bitrefill", productId: frozen.supplier_product_id,
      sku: frozen.supplier_sku, currency: frozen.supplier_currency, faceValue: frozen.supplier_face_value },
    product, expectedCost: quote.allInUsd, frozenQuotedCost: quote.allInUsd,
    frozenMaxSupplierCost: cap, semanticContext: context };
  buildBitrefillInvoiceRequest({ items: [item] });
  const value = freeze({ item, logicalKeyPrefix: `bitrefill:${candidate.orderItem.id}`,
    quote, semanticContext: context, contractFingerprint: createHash("sha256").update(JSON.stringify(context)).digest("hex") });
  preparedTokens.set(value, transport);
  return value;
}
export function assertPreparedPinPurchase(prepared, transport) {
  assertPinTransport(transport);
  if (preparedTokens.get(prepared) !== transport) fail("PREPARATION_TOKEN_REQUIRED");
}
