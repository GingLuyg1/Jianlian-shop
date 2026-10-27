// Local metadata only. Never emits active supplier_binding, submits a purchase,
// writes a customer ledger, or marks an order delivered.
import { createHash } from "node:crypto";
import { LEGACY_SKU_DEFINITIONS } from "../../products/legacy-sku-backfill.mjs";

import { mappingMoney, mappingPreview } from "./mapping-financials.mjs";
export { mappingMoney, mappingPreview } from "./mapping-financials.mjs";
const need = (condition, code) => { if (!condition) throw new Error(code); };
const key = (s) => typeof s === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(s);
const note = (s) => typeof s === "string" && s.trim().length >= 3 && s.length <= 160 &&
  !/[\u0000-\u001f<>@]/u.test(s) && !/password|private.?key|api.?key|token|secret|BEGIN .*KEY/i.test(s);
export function initialLocalSkus() {
  return LEGACY_SKU_DEFINITIONS["gift-apple-us"].map((s) => ({ id: `gift-apple-us:${s.sku_code}`, title: `Apple US ${s.sku_title}`,
    brand: "Apple", country: "US", denominationCurrency: "USD", faceValue: s.sku_code.split("-")[0],
    saleCurrency: "CNY", salePrice: s.price.toFixed(2), source: "legacy_static_unverified", priceVerified: false }));
}
function tables(s) {
  s.localSkus ??= initialLocalSkus(); s.bitrefillMappings ??= []; s.mappingAudit ??= []; s.actualSupplierCosts ??= []; s.aftercareNotes ??= [];
}
export function createLocalBitrefillMappingService({ backend, catalog, now = () => Date.now() }) {
  need(backend?.scope === "bitrefill_local_workspace" && typeof backend.transact === "function", "LOCAL_MAPPING_BACKEND_REQUIRED");
  return Object.freeze({
    async list() {
      const state = structuredClone(await backend.read()); tables(state);
      return { localOnly: true, realPurchaseEnabled: false, skus: state.localSkus,
        mappings: state.bitrefillMappings.map((m) => ({ ...m, financials: mappingPreview(state.localSkus.find((s) => s.id === m.skuId), m) })),
        actualCosts: state.actualSupplierCosts, notes: state.aftercareNotes };
    },
    async addSku(input, actor) {
      need(key(actor) && key(input.id) && note(input.title) && ["Apple", "Amazon", "Other"].includes(input.brand) &&
        /^[A-Z]{2}$/.test(input.country) && /^[A-Z]{3}$/.test(input.denominationCurrency) && /^[A-Z]{3}$/.test(input.saleCurrency), "LOCAL_SKU_INVALID");
      need(mappingMoney(input.faceValue) > 0n && (input.salePrice === null || mappingMoney(input.salePrice) > 0n), "LOCAL_SKU_PRICE_INVALID");
      return backend.transact((state) => {
        tables(state); need(!state.localSkus.some((s) => s.id === input.id), "LOCAL_SKU_ALREADY_EXISTS");
        const sku = { id: input.id, title: input.title, brand: input.brand, country: input.country,
          denominationCurrency: input.denominationCurrency, faceValue: input.faceValue,
          saleCurrency: input.saleCurrency, salePrice: input.salePrice, source: "manual_local_unverified", priceVerified: false };
        state.localSkus.push(sku); return sku;
      });
    },
    async save(input, actor) {
      need(key(actor) && key(input.skuId) && key(input.productId) && Number.isInteger(input.expectedVersion) && input.expectedVersion >= 0 &&
        ["draft", "manual_reviewed"].includes(input.status) && note(input.reviewNote), "MAPPING_INPUT_INVALID");
      need(input.mode === "package" || input.mode === "range", "MAPPING_MODE_INVALID");
      const detail = await catalog.detail(input.productId);
      need(Date.parse(detail.checkedAt) <= now() && now() - Date.parse(detail.checkedAt) <= 300000, "MAPPING_CATALOG_STALE");
      const p = detail.product;
      need(p.id === input.productId, "MAPPING_PRODUCT_IDENTITY_INVALID");
      let face;
      if (input.mode === "package") {
        need(typeof input.packageId === "string" && input.packageId.length <= 200 && input.packageId.length > 0 &&
          !/[\u0000-\u001f\u007f]/u.test(input.packageId) && (input.rangeValue === null || input.rangeValue === undefined), "MAPPING_PACKAGE_REQUIRED");
        const packages = p.packages.filter((x) => x.packageId === input.packageId);
        need(packages.length === 1 && packages[0].faceValue !== null, "MAPPING_PACKAGE_UNKNOWN_OR_NONMONETARY");
        face = mappingMoney(String(packages[0].faceValue));
      } else {
        need((input.packageId === null || input.packageId === undefined) && p.range, "MAPPING_RANGE_REQUIRED");
        face = mappingMoney(input.rangeValue);
        const min = mappingMoney(String(p.range.min)), max = mappingMoney(String(p.range.max)), step = mappingMoney(String(p.range.step));
        need(face > 0n && face >= min && face <= max && step > 0n && (face - min) % step === 0n, "MAPPING_RANGE_OUTSIDE_OR_STEP_INVALID");
      }
      need(input.configuredCost === null || mappingMoney(input.configuredCost) > 0n, "MAPPING_COST_INVALID");
      need(input.configuredFees === null || mappingMoney(input.configuredFees) >= 0n, "MAPPING_FEES_INVALID");
      need((input.configuredCost === null && input.costCurrency === null) ||
        input.configuredCost !== null && /^[A-Z]{3}$/.test(input.costCurrency), "MAPPING_COST_CURRENCY_REQUIRED");
      const fingerprint = createHash("sha256").update(JSON.stringify(p)).digest("hex");
      need(input.catalogFingerprint === fingerprint, "MAPPING_CATALOG_CHANGED_REVIEW_AGAIN");
      return backend.transact((state) => {
        tables(state);
        const sku = state.localSkus.find((s) => s.id === input.skuId); need(sku, "MAPPING_LOCAL_SKU_REQUIRED");
        need(p.country === sku.country && p.currency === sku.denominationCurrency && face === mappingMoney(sku.faceValue), "MAPPING_COUNTRY_CURRENCY_FACE_MISMATCH");
        // This requires explicit SKU-level human assertions, never brand-name inference.
        if (input.status === "manual_reviewed") need(input.productIdentityConfirmed === true && input.denominationConfirmed === true &&
          input.localOnlyAcknowledged === true, "MAPPING_EXPLICIT_REVIEW_REQUIRED");
        if (input.status === "manual_reviewed" && sku.country === "US" && ["Apple", "Amazon"].includes(sku.brand)) {
          need(input.brandCountryConfirmed === true, "MAPPING_US_BRAND_REVIEW_REQUIRED");
        }
        const index = state.bitrefillMappings.findIndex((m) => m.skuId === input.skuId), prior = state.bitrefillMappings[index];
        need((prior?.version ?? 0) === input.expectedVersion, "MAPPING_VERSION_CONFLICT");
        const mapping = { skuId: sku.id, productId: p.id, packageId: input.mode === "package" ? input.packageId : null,
          rangeValue: input.mode === "range" ? input.rangeValue : null, mode: input.mode, country: p.country, denominationCurrency: p.currency,
          faceValue: sku.faceValue, configuredCost: input.configuredCost, costCurrency: input.costCurrency, configuredFees: input.configuredFees,
          costSource: "manual_unverified", status: input.status, version: input.expectedVersion + 1,
          reviewedBy: input.status === "manual_reviewed" ? actor : null, reviewNote: input.reviewNote,
          reviewedAt: input.status === "manual_reviewed" ? new Date(now()).toISOString() : null,
          catalogFingerprint: fingerprint, catalogCheckedAt: detail.checkedAt, availableAtReview: p.available,
          automaticPurchaseAllowed: false, realContractVerified: false };
        if (prior) state.bitrefillMappings[index] = mapping; else state.bitrefillMappings.push(mapping);
        state.mappingAudit.push({ skuId: sku.id, version: mapping.version, actor, fingerprint,
          status: mapping.status, at: new Date(now()).toISOString() });
        return { ...mapping, financials: mappingPreview(sku, mapping) };
      });
    },
    async recordSyntheticActualCost(input) {
      need(backend.synthetic === true && input.source === "synthetic_supplier_get" && key(input.orderItemId) && key(input.invoiceId) &&
        key(input.childId) && /^[a-f0-9]{64}$/.test(input.evidenceFingerprint) && /^[A-Z]{3}$/.test(input.currency) && mappingMoney(input.amount) > 0n,
      "LOCAL_SYNTHETIC_COST_ONLY");
      return backend.transact((s) => {
        tables(s); const prior = s.actualSupplierCosts.find((r) => r.childId === input.childId);
        if (prior) { need(prior.amount === input.amount && prior.currency === input.currency && prior.invoiceId === input.invoiceId &&
          prior.orderItemId === input.orderItemId && prior.evidenceFingerprint === input.evidenceFingerprint, "ACTUAL_COST_CONFLICT"); return prior; }
        const record = { orderItemId: input.orderItemId, invoiceId: input.invoiceId, childId: input.childId, amount: input.amount,
          currency: input.currency, source: input.source, evidenceFingerprint: input.evidenceFingerprint, verified: false,
          recordedAt: new Date(now()).toISOString() };
        s.actualSupplierCosts.push(record); return record;
      });
    },
    async annotateCase(input, actor) {
      need(key(actor) && key(input.caseId) && key(input.requestId) && ["open", "assigned", "resolved_manually"].includes(input.status) &&
        note(input.note), "AFTERCARE_NOTE_INVALID");
      return backend.transact((s) => {
        tables(s); const prior = s.aftercareNotes.find((r) => r.requestId === input.requestId);
        if (prior) { need(prior.caseId === input.caseId && prior.status === input.status && prior.note === input.note && prior.actor === actor,
          "AFTERCARE_REQUEST_CONFLICT"); return prior; }
        const record = { caseId: input.caseId, requestId: input.requestId, status: input.status, note: input.note, actor,
          at: new Date(now()).toISOString(), financialAction: "none", orderStateChanged: false };
        s.aftercareNotes.push(record); return record;
      });
    },
  });
}
