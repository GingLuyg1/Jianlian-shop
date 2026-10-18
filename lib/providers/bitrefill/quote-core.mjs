const DECIMAL = /^(0|[1-9]\d{0,11})(?:\.\d{1,6})?$/;
export function decimalMicros(value) {
  if (typeof value !== "string" || !DECIMAL.test(value)) throw new Error("BITREFILL_QUOTE_DECIMAL_INVALID");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

// Only synthetic quotes are implemented. No live catalog price, denomination,
// label, guessed FX rate or environment variable can become a trusted cost.
export function normalizeBitrefillSyntheticQuote(value, { nowMs = Date.now() } = {}) {
  if (!value || value.synthetic !== true || value.source !== "synthetic_fixture" ||
      value.supplier !== "bitrefill" || value.quantity !== 1 ||
      typeof value.productId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(value.productId) ||
      typeof value.packageId !== "string" || !value.packageId || value.packageId.length > 300 ||
      /[\u0000-\u001f\u007f]/u.test(value.packageId) || !/^[A-Z]{3}$/.test(value.currency ?? "")) {
    throw new Error("BITREFILL_SYNTHETIC_QUOTE_REQUIRED");
  }
  const checked = Date.parse(value.checkedAt);
  const expiry = Date.parse(value.expiresAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(checked) || !Number.isFinite(expiry) ||
      checked > nowMs || checked > expiry || expiry <= nowMs || nowMs - checked > 300_000 ||
      expiry - checked > 300_000) throw new Error("BITREFILL_QUOTE_EXPIRED_OR_INVALID");
  const cost = decimalMicros(value.amount);
  const maximum = decimalMicros(value.maxAllowedSpend);
  if (cost <= 0n || maximum <= 0n || cost > maximum) throw new Error("BITREFILL_QUOTE_SPEND_BLOCKED");
  return Object.freeze({ supplier: "bitrefill", productId: value.productId,
    packageId: value.packageId, quantity: 1, amount: value.amount,
    currency: value.currency, source: "synthetic_fixture", synthetic: true,
    checkedAt: new Date(checked).toISOString(), expiresAt: new Date(expiry).toISOString(),
    maxAllowedSpend: value.maxAllowedSpend });
}

export function assertSyntheticBalance(evidence, quote) {
  if (evidence?.source !== "synthetic_balance" || evidence.state !== "sufficient" ||
      evidence.currency !== quote.currency || decimalMicros(evidence.availableAmount) < decimalMicros(quote.amount)) {
    throw new Error("BITREFILL_SUPPLIER_BALANCE_MANUAL_REVIEW");
  }
}
