import assert from "node:assert/strict";
import test from "node:test";
import { calculateBitrefillTarget15Price as price, evaluateBitrefillDirectSale as sale } from "../../lib/providers/bitrefill/direct-sales-policy.mjs";
const now = Date.parse("2026-11-01T01:00:00Z"), checkedAt = new Date(now).toISOString(), expiresAt = new Date(now + 60000).toISOString();
const fixture = {
  supplier: "bitrefill", productId: "fixture-pin", packageId: "fixture-pin<&>10", salePriceCny: "100.00",
  resaleScopeApproved: true, businessCredentialsVerified: true, upstreamAvailable: true,
  typedFulfillmentVerified: true, authoritativeReconciliationVerified: true,
  atomicBudgetReservationReady: true, boundedSpendAuthorized: true,
  additionalCnyCost: "0", additionalCnyCostsVerified: true,
  balanceUsd: "100", reservedUsd: "1", spentUsd: "1", singleCapUsd: "20", cumulativeCapUsd: "50",
  quote: { source: "authenticated_supplier_cost", feesIncluded: true, currency: "USD", supplierEnforcedDebitCap: true,
    productId: "fixture-pin", packageId: "fixture-pin<&>10", allInUsd: "10", checkedAt, expiresAt },
  fx: { approvedSettlementSource: true, from: "USD", to: "CNY", rate: "7", checkedAt, expiresAt },
};
test("15 percent gross margin is cost/0.85, not cost*1.15", () => {
  assert.equal(price({ allInUsd: "85", usdCnyRate: "1" }).salePriceCny, "100.00");
  assert.equal(price({ allInUsd: "85", usdCnyRate: "1" }).percentageFloor8, "15.00000000");
});
test("no intermediate cost rounding, final price rounds upward to CNY cents", () => {
  const p = price({ allInUsd: "0.01", usdCnyRate: "0.01" });
  assert.equal(p.allInCostCny, "0.0001");assert.equal(p.salePriceCny, "0.01");
  assert.equal(price({ allInUsd: "1", usdCnyRate: "1", additionalCnyCost: "0.01" }).salePriceCny, "1.19");
});
test("decimal boundary at target never uses floating-point approximation", () => {
  assert.equal(price({ allInUsd: "0.085", usdCnyRate: "1" }).salePriceCny, "0.10");
  assert.equal(price({ allInUsd: "0.08500001", usdCnyRate: "1" }).salePriceCny, "0.11");
});
for (const change of [{ allInUsd: "0" }, { allInUsd: "-1" }, { allInUsd: "1e2" }, { usdCnyRate: "0" }, { additionalCnyCost: "-0.01" }]) {
  test("invalid financial decimal rejects " + Object.keys(change).join(), () => assert.throws(() => price({ allInUsd: "1", usdCnyRate: "1", ...change })));
}
test("Daju and other suppliers are outside this policy", () => assert.deepEqual(sale({ supplier: "daju" }, now), { applicable: false, action: "UNCHANGED" }));
test("complete synthetic evidence cannot enable the existing release gate", () => {
  const r = sale(fixture, now);
  assert.deepEqual(r.reasons, ["PRODUCTION_PURCHASE_RELEASE_DISABLED"]);
  assert.equal(r.canAcceptPayment, false);assert.equal(r.actualMargin.percentageFloor8, "30.00000000");
});
test("DB numeric strings with omitted trailing zeros retain their exact cents; fractional cents reject", () => {
  for (const salePriceCny of ["100", "100.0", "100.00"]) assert.equal(sale({ ...fixture, salePriceCny }, now).actualMargin.percentageFloor8, "30.00000000");
  assert.ok(sale({ ...fixture, salePriceCny: "100.001" }, now).reasons.includes("FINANCIAL_DATA_INVALID_OR_INCOMPLETE"));
});
for (const [reason, change] of [
  ["COMMERCIAL_SCOPE_OR_CREDENTIALS", { resaleScopeApproved: false }],
  ["COMMERCIAL_SCOPE_OR_CREDENTIALS", { businessCredentialsVerified: false }],
  ["SUPPLIER_UNAVAILABLE", { upstreamAvailable: false }],
  ["FULFILLMENT_UNVERIFIED", { typedFulfillmentVerified: false }],
  ["BOUNDED_ATOMIC_BUDGET", { boundedSpendAuthorized: false }],
  ["BALANCE_OR_SPEND_LIMIT", { balanceUsd: "10" }],
  ["BALANCE_OR_SPEND_LIMIT", { singleCapUsd: "9.99" }],
  ["BALANCE_OR_SPEND_LIMIT", { cumulativeCapUsd: "11" }],
  ["MARGIN_BELOW_15_PERCENT", { salePriceCny: "82.35" }],
]) test("SKU-only pause: " + reason + JSON.stringify(change), () => {
  const r = sale({ ...fixture, ...change }, now);
  assert.equal(r.action, "PAUSE_BITREFILL_SKU_PURCHASE");assert.ok(r.reasons.includes(reason));
});
for (const change of [{ expiresAt: checkedAt }, { checkedAt: new Date(now + 1).toISOString() }, { checkedAt: new Date(now - 300001).toISOString() }]) {
  test("stale or future quote cannot supply an actual margin " + JSON.stringify(change), () => {
    const r = sale({ ...fixture, quote: { ...fixture.quote, ...change } }, now);
    assert.ok(r.reasons.includes("QUOTE_STALE_OR_INVALID"));assert.equal(r.actualMargin, null);
  });
}
test("display quote, fees unknown, wrong package or unapproved FX cannot claim actual margin", () => {
  for (const input of [{ ...fixture, quote: { ...fixture.quote, source: "display_quote" } },
    { ...fixture, quote: { ...fixture.quote, feesIncluded: false } },
    { ...fixture, quote: { ...fixture.quote, packageId: "wrong" } },
    { ...fixture, fx: { ...fixture.fx, approvedSettlementSource: false } }]) assert.equal(sale(input, now).actualMargin, null);
});
test("missing CNY-side fees are unknown, never silently verified as zero", () => {
  for (const change of [{ additionalCnyCostsVerified: false }, { additionalCnyCost: undefined }]) {
    const result = sale({ ...fixture, ...change }, now);
    assert.ok(result.reasons.includes("CNY_FEES_UNVERIFIED"));assert.equal(result.actualMargin, null);
  }
});
