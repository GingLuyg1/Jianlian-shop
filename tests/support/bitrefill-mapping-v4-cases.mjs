import assert from "node:assert/strict";
import { createLocalBitrefillMappingService } from "../../lib/providers/bitrefill/local-mapping.mjs";
import { createCatalogWorkspace } from "../../scripts/support/bitrefill-catalog-workspace.mjs";
import { catalogFixture, syntheticAftercareState } from "./bitrefill-catalog-fixture.mjs";
export async function runMappingV4Cases(backend) {
  // Marker limits this service to explicitly constructed local backends. No
  // production Supabase backend or supplier binding is created by this harness.
  const local = { scope: "bitrefill_local_workspace", synthetic: true, read: backend.read, transact: backend.transact };
  const { catalog } = catalogFixture();
  const service = createLocalBitrefillMappingService({ backend: local, catalog });
  let checks = 0;
  const check = (v) => { assert.ok(v); checks++; };
  const reject = async (fn, pattern) => { await assert.rejects(fn, pattern); checks++; };
  const before = await backend.read();
  const initial = await service.list(); check(initial.skus.length === 10 && initial.localOnly && !initial.realPurchaseEnabled);
  const sku = initial.skus.find((s) => s.faceValue === "5"); assert.ok(sku);
  const detail = await catalog.detail("mock-apple-us");
  const input = { skuId: sku.id, productId: "mock-apple-us", packageId: "mock-apple-us<&>5", rangeValue: null,
    mode: "package", expectedVersion: 0, status: "manual_reviewed", reviewNote: "MOCK human review", configuredCost: null,
    costCurrency: null, configuredFees: null, catalogFingerprint: detail.fingerprint };
  await reject(() => service.save(input, "local-admin"), /EXPLICIT_REVIEW/);
  const reviewed = { ...input, productIdentityConfirmed: true, denominationConfirmed: true, localOnlyAcknowledged: true };
  await reject(() => service.save(reviewed, "local-admin"), /US_BRAND_REVIEW/);
  const valid = { ...reviewed, brandCountryConfirmed: true, automaticPurchaseAllowed: true };
  const mapping = await service.save(valid, "local-admin");
  check(mapping.version === 1 && mapping.automaticPurchaseAllowed === false && mapping.realContractVerified === false);
  check(mapping.financials.configuredCost === null && mapping.financials.estimatedProfit === null && !mapping.financials.costVerified);
  await reject(() => service.save(valid, "local-admin"), /VERSION_CONFLICT/);
  await reject(() => service.save({ ...valid, expectedVersion: 1, catalogFingerprint: "0".repeat(64) }, "local-admin"), /CATALOG_CHANGED/);
  await reject(() => service.save({ ...valid, expectedVersion: 1, packageId: "unknown" }, "local-admin"), /PACKAGE_UNKNOWN/);
  const ca = await catalog.detail("mock-apple-ca");
  await reject(() => service.save({ ...valid, expectedVersion: 1, productId: ca.product.id, catalogFingerprint: ca.fingerprint }, "local-admin"), /COUNTRY_CURRENCY/);
  const concurrent = await Promise.allSettled([0, 1].map(() => service.save({ ...valid, expectedVersion: 1 }, "local-admin")));
  check(concurrent.filter((r) => r.status === "fulfilled").length === 1 && concurrent.filter((r) => r.status === "rejected").length === 1);
  const amazon = { id: "mock-amazon-sku-10", title: "MOCK Amazon US ten", brand: "Amazon", country: "US", denominationCurrency: "USD", faceValue: "10", saleCurrency: "USD", salePrice: "12.00" };
  await service.addSku(amazon, "local-admin"); checks++;
  await reject(() => service.addSku(amazon, "local-admin"), /ALREADY_EXISTS/);
  const a = await catalog.detail("mock-amazon-us");
  const range = { ...valid, skuId: amazon.id, productId: a.product.id, mode: "range", packageId: null,
    rangeValue: "10", catalogFingerprint: a.fingerprint, expectedVersion: 0, configuredCost: "9.80", configuredFees: "0.20", costCurrency: "USD" };
  const am = await service.save(range, "local-admin");
  check(am.rangeValue === "10" && am.packageId === null && am.financials.estimatedProfit === "2.00" && !am.financials.profitVerified);
  await reject(() => service.save({ ...range, rangeValue: "10.1", expectedVersion: 1 }, "local-admin"), /STEP_INVALID/);
  await reject(() => service.save({ ...range, rangeValue: "101", expectedVersion: 1 }, "local-admin"), /STEP_INVALID/);
  const fx = await service.save({ ...range, expectedVersion: 1, costCurrency: "EUR" }, "local-admin");
  check(fx.financials.estimatedProfit === null && !fx.financials.costVerified);
  const decimal = { ...amazon, id: "mock-decimal-sku", brand: "Other", faceValue: "0.3", salePrice: null };
  await service.addSku(decimal, "local-admin");
  const d = await catalog.detail("mock-range-us");
  const dec = await service.save({ ...valid, status: "draft", expectedVersion: 0, skuId: decimal.id, productId: d.product.id,
    mode: "range", packageId: null, rangeValue: "0.3", catalogFingerprint: d.fingerprint }, "local-admin");
  check(dec.rangeValue === "0.3" && dec.financials.estimatedProfit === null);
  const actual = { orderItemId: "mock-cost-item", invoiceId: "mock-cost-invoice", childId: "mock-cost-child", amount: "4.80", currency: "USD", source: "synthetic_supplier_get", evidenceFingerprint: "a".repeat(64) };
  const actuals = await Promise.all([0, 1, 2].map(() => service.recordSyntheticActualCost(actual)));
  check(actuals.every((r) => r.verified === false));
  check((await service.list()).actualCosts.length === 1);
  await reject(() => service.recordSyntheticActualCost({ ...actual, amount: "4.81" }), /ACTUAL_COST_CONFLICT/);
  await reject(() => createLocalBitrefillMappingService({ backend: { ...local, synthetic: false }, catalog }).recordSyntheticActualCost(actual), /SYNTHETIC_COST_ONLY/);
  const note = { caseId: "bitrefill:mock-order", requestId: "mock-note-request", status: "resolved_manually", note: "MOCK support review" };
  const notes = await Promise.all([0, 1, 2].map(() => service.annotateCase(note, "local-admin")));
  check(notes.every((r) => r.financialAction === "none" && r.orderStateChanged === false));
  check((await service.list()).notes.length === 1);
  await reject(() => service.annotateCase({ ...note, status: "assigned" }, "local-admin"), /REQUEST_CONFLICT/);
  const after = await backend.read();
  for (const name of ["orders", "ledger", "balances", "privateDeliveries", "supplier_purchase_attempts", "supplier_external_orders"]) {
    assert.deepEqual(after[name], before[name]); checks++;
  }
  const app = await createCatalogWorkspace({ backend: local, catalog, renderHtml: () => "LOCAL SYNTHETIC" });
  try {
    const api = `${app.origin}/api/admin/suppliers/bitrefill`;
    check((await fetch(`${api}/mappings`)).status === 401);
    const bootstrap = await fetch(app.origin); const cookie = bootstrap.headers.get("set-cookie").split(";")[0];
    check((await fetch(`${api}/mappings`, { headers: { Cookie: cookie } })).status === 200);
    check((await fetch(`${api}/mappings`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: "{}" })).status === 403);
    const headers = { Cookie: cookie, Origin: app.origin, "Content-Type": "application/json", "x-jianlian-local-workspace": "v4" };
    check((await fetch(`${api}/refund`, { method: "POST", headers, body: "{}" })).status === 404);
    check((await fetch(`${api}/purchase`, { method: "POST", headers, body: "{}" })).status === 404);
    check((await fetch(`${api}/mappings`, { headers: { Cookie: cookie, Origin: "https://untrusted.invalid" } })).status === 403);
    check((await fetch(`${api}/aftercare-notes`, { method: "POST", headers, body: JSON.stringify(note) })).status === 409);
  } finally { await app.close(); }
  return { checks, backend: "local_metadata_only", realPurchaseEnabled: false, financialActions: 0 };
}
export async function runAftercareHttpCases(backend) {
  await backend.transact((s) => Object.assign(s, syntheticAftercareState()));
  const local = { scope: "bitrefill_local_workspace", synthetic: true, read: backend.read, transact: backend.transact };
  const app = await createCatalogWorkspace({ backend: local, catalog: catalogFixture().catalog, renderHtml: () => "LOCAL SYNTHETIC" });
  try {
    const b = await fetch(app.origin), cookie = b.headers.get("set-cookie").split(";")[0];
    const headers = { Cookie: cookie, Origin: app.origin, "Content-Type": "application/json", "x-jianlian-local-workspace": "v4" };
    const base = `${app.origin}/api/admin/suppliers/bitrefill`;
    const cases = await (await fetch(`${base}/aftercare`, { headers })).json();
    assert.deepEqual(cases.cases.map((c) => c.kind), ["PARTIAL_FAILURE", "SUPPLIER_REFUNDED"]);
    assert.ok(cases.cases.every((c) => c.automaticCustomerRefund === false));
    const before = await backend.read();
    const input = { caseId: cases.cases[0].id, status: "resolved_manually", note: "MOCK manual handling only", requestId: "mock-case-note" };
    const responses = await Promise.all([0, 1, 2].map(() => fetch(`${base}/aftercare-notes`, { method: "POST", headers, body: JSON.stringify(input) })));
    assert.ok(responses.every((r) => r.status === 200));
    const after = await backend.read();
    for (const key of ["orders", "ledger", "balances", "privateDeliveries", "supplier_external_orders"]) assert.deepEqual(after[key], before[key]);
    assert.equal(after.aftercareNotes.filter((n) => n.requestId === input.requestId).length, 1);
    return { checks: 9, automaticCustomerRefund: false, actualFinancialMutations: 0 };
  } finally { await app.close(); }
}
