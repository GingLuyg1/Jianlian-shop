import { isPlainRecord, parseDajuDecimal } from "./protocol.mjs";

const INPUT_SOURCES = new Set([
  "customer_email",
  "customer_name",
  "customer_phone",
  "customer_note",
]);

function nonEmptyText(value, max) {
  return typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null;
}

export function parseDajuProductBinding(productMetadata, skuMetadata = null) {
  if (!isPlainRecord(productMetadata)) return null;
  const merged = isPlainRecord(skuMetadata) ? { ...productMetadata, ...skuMetadata } : productMetadata;
  if (merged.fulfillment_source !== "supplier" || merged.supplier !== "daju") return null;
  if (!Number.isSafeInteger(merged.supplier_product_id) || merged.supplier_product_id < 1) return null;
  const supplierSku = merged.supplier_sku === undefined || merged.supplier_sku === null
    ? null
    : nonEmptyText(merged.supplier_sku, 200);
  if (merged.supplier_sku !== undefined && merged.supplier_sku !== null && !supplierSku) return null;
  const mapping = merged.supplier_inputs_mapping === undefined ? {} : merged.supplier_inputs_mapping;
  if (!isPlainRecord(mapping)) return null;
  const normalizedMapping = {};
  for (const [supplierField, sourceField] of Object.entries(mapping)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(supplierField) || typeof sourceField !== "string" || !INPUT_SOURCES.has(sourceField)) {
      return null;
    }
    normalizedMapping[supplierField] = sourceField;
  }
  const maxUnitCost = merged.supplier_max_unit_cost === undefined || merged.supplier_max_unit_cost === null
    ? null
    : parseDajuDecimal(merged.supplier_max_unit_cost);
  if (merged.supplier_max_unit_cost !== undefined && merged.supplier_max_unit_cost !== null && maxUnitCost === null) return null;
  return {
    supplier: "daju",
    productId: merged.supplier_product_id,
    sku: supplierSku,
    inputsMapping: normalizedMapping,
    maxUnitCost,
  };
}

export function isDajuSupplierMetadata(productMetadata, skuMetadata = null) {
  const product = isPlainRecord(productMetadata) ? productMetadata : {};
  const merged = isPlainRecord(skuMetadata) ? { ...product, ...skuMetadata } : product;
  return merged.fulfillment_source === "supplier" && merged.supplier === "daju";
}

export function mapDajuRequiredInputs(requiredInputs, mapping, orderFields) {
  if (!Array.isArray(requiredInputs) || !isPlainRecord(mapping) || !isPlainRecord(orderFields)) {
    return { ok: false, code: "FAILED_VALIDATION", missing: [] };
  }
  const inputs = {};
  const missing = [];
  for (const required of requiredInputs) {
    if (typeof required !== "string" || !/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(required)) {
      return { ok: false, code: "FAILED_VALIDATION", missing: [] };
    }
    const source = mapping[required];
    if (typeof source !== "string" || !INPUT_SOURCES.has(source)) {
      missing.push(required);
      continue;
    }
    const value = nonEmptyText(orderFields[source], 1000);
    if (!value) missing.push(required);
    else inputs[required] = value;
  }
  return missing.length > 0
    ? { ok: false, code: "NEEDS_INPUT", missing }
    : { ok: true, inputs };
}

function decimalParts(value) {
  const normalized = parseDajuDecimal(value);
  if (!normalized) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return { coefficient: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

export function compareDajuDecimal(left, right) {
  const a = decimalParts(left);
  const b = decimalParts(right);
  if (!a || !b) return null;
  const scale = Math.max(a.scale, b.scale);
  const leftValue = a.coefficient * 10n ** BigInt(scale - a.scale);
  const rightValue = b.coefficient * 10n ** BigInt(scale - b.scale);
  return leftValue === rightValue ? 0 : leftValue < rightValue ? -1 : 1;
}

export function validateDajuPurchaseReadiness(input) {
  if (!input.product || input.product.id !== input.binding.productId) {
    return { ok: false, code: "PRODUCT_NOT_FOUND" };
  }
  if (!input.product.isAuto || input.product.stock < input.quantity) {
    return { ok: false, code: "OUT_OF_STOCK" };
  }
  if (input.quantity < input.product.minQty || input.quantity > input.product.maxQty) {
    return { ok: false, code: "FAILED_VALIDATION" };
  }
  if (input.binding.maxUnitCost === null) return { ok: false, code: "COST_LIMIT_UNCONFIGURED" };
  const comparison = compareDajuDecimal(input.product.price, input.binding.maxUnitCost);
  if (comparison === null || comparison > 0) return { ok: false, code: "COST_LIMIT_EXCEEDED" };
  return mapDajuRequiredInputs(input.product.requiredInputs, input.binding.inputsMapping, input.orderFields);
}
