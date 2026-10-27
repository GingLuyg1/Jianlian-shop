// Display-only fixed-point arithmetic. Not a purchase quote or financial ledger.
const SCALE = 100000000n;
export function mappingMoney(value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,8})(?:\.\d{1,8})?$/.test(value)) throw Error("MAPPING_AMOUNT_INVALID");
  const [whole, part = ""] = value.split("."); return BigInt(whole) * SCALE + BigInt(part.padEnd(8, "0"));
}
function displayMoney(value) {
  const negative = value < 0n, n = negative ? -value : value;
  return `${negative ? "-" : ""}${n / SCALE}.${String(n % SCALE).padStart(8, "0").replace(/0+$/, "") || "00"}`;
}
export function mappingPreview(sku, mapping, actual = null) {
  const cost = mapping.configuredCost;
  const comparable = cost && mapping.configuredFees !== null && sku.salePrice !== null && sku.saleCurrency === mapping.costCurrency;
  return { salePrice: sku.salePrice, saleCurrency: sku.saleCurrency, salePriceSource: sku.source, salePriceVerified: false,
    configuredCost: cost, costCurrency: mapping.costCurrency, configuredFees: mapping.configuredFees, costVerified: false,
    estimatedProfit: comparable ? displayMoney(mappingMoney(sku.salePrice) - mappingMoney(cost) - mappingMoney(mapping.configuredFees)) : null,
    profitVerified: false, profitReason: comparable ? "UNVERIFIED_MANUAL_INPUTS" : "MISSING_COST_FEES_OR_TRUSTED_FX",
    actualCost: actual ? { amount: actual.amount, currency: actual.currency, source: actual.source, verified: false,
      invoiceId: actual.invoiceId, childId: actual.childId, evidenceFingerprint: actual.evidenceFingerprint } : null };
}
