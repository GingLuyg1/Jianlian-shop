import test from "node:test";
import assert from "node:assert/strict";
import { buildMobileCatalog, classifyMobileProduct, validateMobileRecipient } from "../../lib/providers/bitrefill/mobile-catalog.mjs";
import { evaluateMobileProcurementReadiness } from "../../lib/providers/bitrefill/mobile-readiness.mjs";
import { redactBitrefillLogValue } from "../../lib/providers/bitrefill/protocol.mjs";
import { REAL_BITREFILL_PURCHASE_ENABLED } from "../../lib/providers/bitrefill/prelaunch-policy.mjs";

const raw = { id: "fixture-pin", name: "Fixture PIN", country_code: "GB", currency: "GBP",
  categories: ["pin", "refill"], recipient_type: "none", in_stock: true,
  packages: [{ id: "fixture-pin<&>10", value: "10", price: 1234 }] };
const page = (products) => ({ name: "fixture", startedAt: "2026-11-01T00:00:00Z", data: { data: products } });
test("catalog preserves exact package and treats raw price as unknown cost, never CNY sale price", () => {
  const result = buildMobileCatalog([page([raw])]);
  assert.equal(result.packages[0].packageId, "fixture-pin<&>10");
  assert.equal(result.packages[0].finalCost, null);
  assert.equal(result.packages[0].suggestedCny, null);
  assert.equal(result.packages[0].status, "DRAFT_PLAN_ONLY");
});
test("identical pages deduplicate but supplier drift stops", () => {
  assert.equal(buildMobileCatalog([page([raw]), page([raw])]).packages.length, 1);
  assert.equal(buildMobileCatalog([page([raw]), { ...page([raw]), name: "other-category", startedAt: "2026-11-01T00:01:00Z" }]).packages.length, 1);
  assert.throws(() => buildMobileCatalog([page([raw]), page([{ ...raw, in_stock: false }])]), /DRIFT/);
});
test("long exact bundle IDs stay quarantined without widening the purchase parser", () => {
  const packageId = "fixture-" + "x".repeat(340);
  const result = buildMobileCatalog([page([{ ...raw, packages: [{ id: packageId, value: "10", price: 1 }] }])]);
  assert.equal(result.packages[0].packageId, packageId);
  assert.equal(result.products[0].schemaStatus, "QUARANTINED_READONLY");
});
test("unsupported bundle labels remain quarantined and are never silently dropped", () => {
  const x = buildMobileCatalog([page([{ ...raw, packages: [{ id: "exact-bundle", value: "<special bundle>", price: 10 }] }])]);
  assert.equal(x.products.length, 1);
  assert.equal(x.packages[0].schemaStatus, "QUARANTINED_READONLY");
  assert.equal(x.packages[0].packageId, "exact-bundle");
  assert.equal(x.packages[0].faceValue, null);
});
test("PIN, direct topup, data, unsupported account are separate kinds", () => {
  assert.equal(classifyMobileProduct(raw), "PIN");
  assert.equal(classifyMobileProduct({ recipient_type: "phone_number", categories: ["refill"] }), "DIRECT_TOPUP");
  assert.equal(classifyMobileProduct({ recipient_type: "phone_number", categories: ["data"] }), "DIRECT_DATA");
  assert.equal(classifyMobileProduct({ recipient_type: "account" }), "REVIEW_REQUIRED");
});
test("PIN cannot carry a phone; direct format alone never proves operator", () => {
  assert.throws(() => validateMobileRecipient({ deliveryKind: "PIN", phoneNumber: "+447700900000" }), /PIN_RECIPIENT/);
  assert.deepEqual(validateMobileRecipient({ deliveryKind: "PIN" }), { kind: "PIN", recipientRequired: false });
  assert.throws(() => validateMobileRecipient({ deliveryKind: "DIRECT_TOPUP", country: "GB", operatorId: "fixture", phoneNumber: "+447700900000" }), /LOOKUP_REQUIRED/);
});
for (const phoneNumber of ["07700900000", "+01234", "+44 7700900000", "+447700900000\n", "x", null]) {
  test("direct input rejects malformed synthetic recipient " + String(phoneNumber).replace(/\W/g, "_").slice(0, 20), () => {
    assert.throws(() => validateMobileRecipient({ deliveryKind: "DIRECT_TOPUP", country: "GB", operatorId: "fixture", phoneNumber }), /RECIPIENT_INVALID/);
  });
}
test("verified recipient is not echoed; mismatched country/operator/number reject", () => {
  const input = { deliveryKind: "DIRECT_TOPUP", country: "GB", operatorId: "fixture", phoneNumber: "+447700900000",
    lookup: { country: "GB", productId: "fixture", phoneNumber: "+447700900000", authoritative: true } };
  assert.deepEqual(validateMobileRecipient(input), { kind: "DIRECT_TOPUP", recipientRequired: true });
  for (const change of [{ country: "US" }, { productId: "other" }, { phoneNumber: "+447700900001" }, { authoritative: false }]) {
    assert.throws(() => validateMobileRecipient({ ...input, lookup: { ...input.lookup, ...change } }), /LOOKUP_REQUIRED/);
  }
});
test("nested phones, recipients and destination are redacted without hiding useful status", () => {
  const safe = redactBitrefillLogValue({ status: "pending", phone_number: "+447700900000", nested: [{ msisdn: "synthetic", recipient: { number: "synthetic" }, destination: "synthetic" }] });
  assert.equal(safe.status, "pending");
  assert.equal(safe.phone_number, "[REDACTED]");
  assert.equal(safe.nested[0].recipient, "[REDACTED]");
  assert.equal(safe.nested[0].msisdn, "[REDACTED]");
});
const evidence = {
  businessResaleApproved: true, productScopeApproved: true, businessCredentialsVerified: true,
  paidOrderVerified: true, paymentRiskClear: true, localStockChecked: true,
  cost: { source: "authenticated_supplier_cost", feesIncluded: true, currency: "USD", supplierEnforcedCap: true, amount: "10" },
  fx: { sourceVerified: true, from: "USD", to: "CNY", rate: "7" }, netRevenueCny: "100",
  singleCapUsd: "10", availableBalanceUsd: "50", reservedUsd: "5", cumulativeCapUsd: "30", committedUsd: "10",
  minimumMarginBps: 1500, atomicBudgetReservationVerified: true, privateRecipientPathVerified: true,
  deliveryKindVerified: true, authoritativeReconciliationVerified: true, durableIdempotencyVerified: true,
};
test("even complete synthetic readiness evidence does not authorize or enable purchases", () => {
  assert.deepEqual(evaluateMobileProcurementReadiness(evidence), { ready: true, blockers: [], purchaseAuthorized: false });
  assert.equal(REAL_BITREFILL_PURCHASE_ENABLED, false);
});
for (const key of ["businessResaleApproved", "productScopeApproved", "businessCredentialsVerified", "paidOrderVerified", "paymentRiskClear", "localStockChecked", "atomicBudgetReservationVerified", "privateRecipientPathVerified", "deliveryKindVerified", "authoritativeReconciliationVerified", "durableIdempotencyVerified"]) {
  test("missing gate rejects: " + key, () => assert.equal(evaluateMobileProcurementReadiness({ ...evidence, [key]: false }).ready, false));
}
test("display quote, uncertain fees, FX, insufficient balance, negative margin and cumulative overflow all reject", () => {
  for (const change of [{ cost: { ...evidence.cost, source: "display" } }, { cost: { ...evidence.cost, feesIncluded: false } },
    { cost: { ...evidence.cost, supplierEnforcedCap: false } }, { fx: { ...evidence.fx, sourceVerified: false } },
    { availableBalanceUsd: "14" }, { netRevenueCny: "70" }, { cumulativeCapUsd: "24" }, { cost: undefined }]) {
    assert.equal(evaluateMobileProcurementReadiness({ ...evidence, ...change }).ready, false);
  }
});
