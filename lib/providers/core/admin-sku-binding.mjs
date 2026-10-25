// Unified SKU metadata only. No secondary mapping table, purchase or ledger API.
import { createHash } from "node:crypto";
import { mappingMoney, mappingPreview } from "../bitrefill/mapping-financials.mjs";
const need = (ok, code) => { if (!ok) throw new Error(code); };
const record = (x) => x && typeof x === "object" && !Array.isArray(x) ? x : {};
const fields = ["fulfillment_source", "supplier", "provider_key", "supplier_product_id", "supplier_sku", "supplier_package_id", "range_value",
  "supplier_face_value", "supplier_currency", "supplier_country", "supplier_cost", "supplier_cost_currency", "supplier_cost_verified",
  "supplier_price_verified", "supplier_max_unit_cost", "supplier_binding_status", "supplier_auto_purchase_enabled", "supplier_binding_version"];
export const bindingSummary = (m) => Object.fromEntries(fields.map((key) => [key, record(m)[key] ?? null]));
export function bindingHistory(metadata, actor, at, next, action) {
  const prior = record(metadata), history = prior.supplier_binding_audit ?? [];
  need(Array.isArray(history) && history.length < 50 && JSON.stringify(history).length < 32000, "BINDING_AUDIT_CAP_REACHED");
  const version = prior.supplier_binding_version ?? 0;
  need(Number.isSafeInteger(version) && version >= 0 && version < 1000000, "BINDING_VERSION_INVALID");
  return { supplier_binding_version: version + 1, supplier_binding_audit: [...history, {
    version: version + 1, actor, at, action, before: bindingSummary(prior),
    beforeCandidate: prior.supplier_binding_candidate ? bindingSummary(prior.supplier_binding_candidate) : null, after: bindingSummary(next) }] };
}
export function prepareDajuBindingMetadata(current, binding, stock, actor, at) {
  const prior = record(current), next = { ...prior };
  // Keep Daju contract and purchase fields unchanged; discard stale Bitrefill
  // candidate/financial/denomination fields when explicitly saving Daju.
  for (const field of [...fields, "supplier_binding_candidate", "supplier_configured_fees", "supplier_product_type", "supplier_review_note", "supplier_catalog_fingerprint"]) delete next[field];
  const configuration = { ...binding, provider_key: "daju", supplier_package_id: null, range_value: null,
    supplier_face_value: null, supplier_currency: "CNY", supplier_country: null, supplier_cost: null,
    supplier_cost_currency: "CNY", supplier_cost_verified: false, supplier_price_verified: false,
    supplier_binding_status: "daju_authoritative_configuration", supplier_auto_purchase_enabled: true };
  return { ...next, ...configuration, ...stock, ...bindingHistory(prior, actor, at, configuration, "save_daju_binding") };
}
export async function prepareBitrefillSkuBinding({ product, sku, input, catalog, actor, now = () => Date.now() }) {
  need(product && sku && sku.product_id === product.id && input.website_sku_id === sku.id, "BINDING_SKU_OWNER_MISMATCH");
  const prior = record(sku.metadata);
  need(typeof sku.updated_at === "string" && input.expected_updated_at === sku.updated_at &&
    input.expected_binding_version === (prior.supplier_binding_version ?? 0), "BINDING_STALE_REOPEN_REQUIRED");
  need(input.verified !== true && input.automatic_purchase_enabled !== true, "BITREFILL_ACTIVATION_NOT_AUTHORIZED");
  need(["draft", "manual_reviewed_unverified"].includes(input.review_status), "BINDING_REVIEW_STATUS_INVALID");
  need(typeof input.review_note === "string" && input.review_note.trim().length >= 3 && input.review_note.length <= 160 &&
    !/[<>@\u0000-\u001f]/u.test(input.review_note) && !/password|private.?key|api.?key|token|secret/i.test(input.review_note), "BINDING_REVIEW_NOTE_INVALID");
  const facts = record(input.sku_facts);
  need(/^[A-Z]{2}$/.test(facts.country) && /^[A-Z]{3}$/.test(facts.currency) && mappingMoney(facts.face_value) > 0n, "BINDING_SKU_FACTS_REQUIRED");
  const detail = await catalog.detail(input.supplier_product_id), p = detail.product;
  const fingerprint = createHash("sha256").update(JSON.stringify(p)).digest("hex");
  need(p.id === input.supplier_product_id && fingerprint === input.catalog_fingerprint && Date.parse(detail.checkedAt) <= now() &&
    now() - Date.parse(detail.checkedAt) <= 300000, "BINDING_CATALOG_CHANGED_REVIEW_AGAIN");
  need(p.country === facts.country && p.currency === facts.currency, "BINDING_COUNTRY_CURRENCY_MISMATCH");
  let face;
  if (input.mode === "package") {
    need(input.range_value === null && typeof input.supplier_package_id === "string", "BINDING_PACKAGE_REQUIRED");
    const matches = p.packages.filter((x) => x.packageId === input.supplier_package_id);
    need(matches.length === 1 && matches[0].faceValue !== null, "BINDING_PACKAGE_NOT_MONETARY_OR_MISSING");
    face = mappingMoney(String(matches[0].faceValue));
  } else {
    need(input.mode === "range" && input.supplier_package_id === null && p.range, "BINDING_RANGE_REQUIRED");
    face = mappingMoney(input.range_value);
    const min = mappingMoney(String(p.range.min)), step = mappingMoney(String(p.range.step));
    need(face >= min && face <= mappingMoney(String(p.range.max)) && step > 0n && (face - min) % step === 0n, "BINDING_RANGE_STEP_INVALID");
  }
  need(face === mappingMoney(facts.face_value), "BINDING_FACE_VALUE_MISMATCH");
  need(input.configured_cost === null || mappingMoney(input.configured_cost) > 0n, "BINDING_COST_INVALID");
  need(input.configured_fees === null || mappingMoney(input.configured_fees) >= 0n, "BINDING_FEES_INVALID");
  need(input.configured_cost === null ? input.cost_currency === null : /^[A-Z]{3}$/.test(input.cost_currency), "BINDING_COST_CURRENCY_REQUIRED");
  if (input.review_status === "manual_reviewed_unverified") {
    need(input.identity_confirmed === true && input.denomination_confirmed === true && input.brand_country_confirmed === true, "BINDING_EXPLICIT_REVIEW_REQUIRED");
    // This UI supports gift cards only. Unknown/top-up/eSIM required fields cannot
    // be assumed absent; keep those as unverified drafts, never auto fulfill.
    need(p.category === "gift_card", "BINDING_PRODUCT_TYPE_UNVERIFIED_DRAFT_ONLY");
  }
  const at = new Date(now()).toISOString();
  const candidate = { fulfillment_source: "supplier", supplier: "bitrefill", provider_key: "bitrefill", supplier_product_id: p.id,
    supplier_package_id: input.mode === "package" ? input.supplier_package_id : null, supplier_sku: input.mode === "package" ? input.supplier_package_id : null,
    range_value: input.mode === "range" ? input.range_value : null, supplier_face_value: facts.face_value, supplier_currency: p.currency,
    supplier_country: p.country, supplier_product_type: p.category, supplier_cost: input.configured_cost,
    supplier_cost_currency: input.cost_currency, supplier_configured_fees: input.configured_fees,
    supplier_cost_verified: false, supplier_price_verified: false, supplier_binding_status: input.review_status,
    supplier_auto_purchase_enabled: false, supplier_binding_version: (prior.supplier_binding_version ?? 0) + 1,
    supplier_catalog_fingerprint: fingerprint, supplier_catalog_checked_at: detail.checkedAt,
    supplier_review_note: input.review_note, supplier_reviewed_by: actor, supplier_reviewed_at: at,
    sku_facts_source: "admin_unverified", required_parameters_verified: false, business_contract_verified: false };
  const audit = bindingHistory(prior, actor, at, candidate, "save_bitrefill_candidate");
  return { metadata: { ...prior, ...audit, supplier_binding_candidate: candidate }, candidate,
    activeBindingUnchanged: true, financials: mappingPreview({ salePrice: String(sku.price), saleCurrency: "CNY", source: "current_sku_price" },
      { configuredCost: input.configured_cost, configuredFees: input.configured_fees, costCurrency: input.cost_currency }) };
}
export async function saveBitrefillSkuBinding({ service, productId, input, catalog, actor }) {
  const productRead = await service.from("products").select("id,name,metadata,delivery_type").eq("id", productId).maybeSingle();
  const skuRead = await service.from("product_skus").select("id,product_id,price,metadata,updated_at").eq("id", input.website_sku_id).eq("product_id", productId).maybeSingle();
  need(!productRead.error && productRead.data && !skuRead.error && skuRead.data, "BINDING_PRODUCT_OR_SKU_NOT_FOUND");
  const planned = await prepareBitrefillSkuBinding({ product: productRead.data, sku: skuRead.data, input, catalog, actor });
  // Single-row CAS commits the metadata candidate and its audit together. No
  // order_items UPDATE, no stock/delivery/status change and no money RPC.
  let query = service.from("product_skus").update({ metadata: planned.metadata }).eq("id", input.website_sku_id)
    .eq("product_id", productId).eq("updated_at", skuRead.data.updated_at);
  const revision = skuRead.data.metadata?.supplier_binding_version;
  query = revision == null ? query.is("metadata->>supplier_binding_version", null) : query.eq("metadata->>supplier_binding_version", String(revision));
  const saved = await query.select("id,product_id,sku_code,sku_title,price,original_price,stock,status,delivery_type,image_url,sort_order,metadata,updated_at").maybeSingle();
  need(!saved.error && saved.data, "BINDING_CONCURRENT_CHANGE_REOPEN_REQUIRED");
  return { sku: saved.data, product: productRead.data, candidate: planned.candidate, financials: planned.financials,
    activeBindingUnchanged: true, realPurchaseEnabled: false };
}
