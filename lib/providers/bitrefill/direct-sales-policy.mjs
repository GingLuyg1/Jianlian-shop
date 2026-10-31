// Server-side Bitrefill-only sale decision. No order, purchase, or DB mutation.
// All evidence is supplied by trusted loaders, never by a customer request.
import { mappingMoney } from "./mapping-financials.mjs";
import { REAL_BITREFILL_PURCHASE_ENABLED } from "./prelaunch-policy.mjs";

const SCALE = 100000000n, COST_SCALE = SCALE * SCALE;
const ceil = (n, d) => (n + d - 1n) / d;
const positive = v => { const n = mappingMoney(v); if (n <= 0n) throw Error("BITREFILL_SALES_AMOUNT_INVALID"); return n; };
const cents = v => {
  if (typeof v !== "string" || !/^(0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(v)) throw Error("BITREFILL_SALES_CNY_CENTS_REQUIRED");
  return positive(v) * SCALE;
};
function decimal(n, scale, places) {
  return `${n / scale}.${String(n % scale).padStart(places, "0")}`.replace(/\.?0+$/, "");
}
function margin(cost, revenue) {
  if (revenue < cost) return { meetsTarget: false, percentageFloor8: null };
  const value = (revenue - cost) * 10000000000n / revenue;
  return { meetsTarget: (revenue - cost) * 100n >= revenue * 15n,
    percentageFloor8: `${value / 100000000n}.${String(value % 100000000n).padStart(8, "0")}` };
}

// Keep cost at 16 decimal places throughout. Only final CNY retail is rounded
// upward to cents. This is gross margin (cost/0.85), not a 15% markup.
export function calculateBitrefillTarget15Price({ allInUsd, usdCnyRate, additionalCnyCost = "0" }) {
  const cost = positive(allInUsd) * positive(usdCnyRate) + mappingMoney(additionalCnyCost) * SCALE;
  const retailCents = ceil(cost * 10000n, COST_SCALE * 85n);
  const salePriceCny = `${retailCents / 100n}.${String(retailCents % 100n).padStart(2, "0")}`;
  return { allInCostCny: decimal(cost, COST_SCALE, 16), salePriceCny,
    targetMarginPercent: "15", ...margin(cost, cents(salePriceCny)),
    rounding: "CEILING_CNY_CENT_AFTER_EXACT_COST_DIVIDED_BY_0_85" };
}

function fresh(evidence, nowMs) {
  const start = Date.parse(evidence?.checkedAt), end = Date.parse(evidence?.expiresAt);
  return Number.isFinite(nowMs) && Number.isFinite(start) && Number.isFinite(end) &&
    start <= nowMs && nowMs < end && nowMs - start <= 300000 && end - start <= 300000;
}

export function evaluateBitrefillDirectSale(input, nowMs = Date.now()) {
  if (input?.supplier !== "bitrefill") return { applicable: false, action: "UNCHANGED" };
  const reasons = [], need = (ok, reason) => { if (!ok) reasons.push(reason); };
  const quote = input.quote, fx = input.fx;
  need(input.resaleScopeApproved === true && input.businessCredentialsVerified === true, "COMMERCIAL_SCOPE_OR_CREDENTIALS");
  need(quote?.source === "authenticated_supplier_cost" && quote.feesIncluded === true && quote.currency === "USD" &&
    quote.supplierEnforcedDebitCap === true, "ALL_IN_COST_AND_ENFORCEABLE_CAP");
  need(quote?.productId === input.productId && quote?.packageId === input.packageId &&
    typeof input.productId === "string" && typeof input.packageId === "string", "EXACT_PRODUCT_PACKAGE");
  need(fresh(quote, nowMs), "QUOTE_STALE_OR_INVALID");
  need(fx?.approvedSettlementSource === true && fx.from === "USD" && fx.to === "CNY" && fresh(fx, nowMs), "FX_STALE_OR_UNVERIFIED");
  need(input.upstreamAvailable === true, "SUPPLIER_UNAVAILABLE");
  need(input.typedFulfillmentVerified === true && input.authoritativeReconciliationVerified === true, "FULFILLMENT_UNVERIFIED");
  need(input.atomicBudgetReservationReady === true && input.boundedSpendAuthorized === true, "BOUNDED_ATOMIC_BUDGET");
  let pricing = null, currentMargin = null;
  try {
    pricing = calculateBitrefillTarget15Price({ allInUsd: quote.allInUsd, usdCnyRate: fx.rate, additionalCnyCost: input.additionalCnyCost ?? "0" });
    const cost = positive(quote.allInUsd) * positive(fx.rate) + mappingMoney(input.additionalCnyCost ?? "0") * SCALE;
    currentMargin = margin(cost, cents(input.salePriceCny));
    need(currentMargin.meetsTarget, "MARGIN_BELOW_15_PERCENT");
    const usd = positive(quote.allInUsd), reserved = mappingMoney(input.reservedUsd);
    need(usd <= positive(input.singleCapUsd) && usd + reserved <= mappingMoney(input.balanceUsd) &&
      usd + reserved + mappingMoney(input.spentUsd) <= positive(input.cumulativeCapUsd), "BALANCE_OR_SPEND_LIMIT");
  } catch { reasons.push("FINANCIAL_DATA_INVALID_OR_INCOMPLETE"); }
  // No configuration or evidence flag can override the existing release gate.
  need(REAL_BITREFILL_PURCHASE_ENABLED, "PRODUCTION_PURCHASE_RELEASE_DISABLED");
  const trustedCost = !reasons.some(r => ["ALL_IN_COST_AND_ENFORCEABLE_CAP", "EXACT_PRODUCT_PACKAGE", "QUOTE_STALE_OR_INVALID", "FX_STALE_OR_UNVERIFIED", "FINANCIAL_DATA_INVALID_OR_INCOMPLETE"].includes(r));
  return { applicable: true, action: reasons.length ? "PAUSE_BITREFILL_SKU_PURCHASE" : "ALLOW",
    canAcceptPayment: reasons.length === 0, reasons, pricing: trustedCost ? pricing : null,
    actualMargin: trustedCost ? currentMargin : null };
}
