import { getKuajingZyPurchaseGateState as gateState } from './purchase-gate-state.mjs';
import { parseKuajingZyCny, calculateKuajingZyExpectedAmount } from './mall-order-contract.mjs';

// A subsequent reviewed release must change this literal. Environment alone
// cannot enable the Production composition shipped by this PR.
export const KUAJINGZY_PURCHASE_RELEASE_ENABLED = true;
export class KuajingZyPreSubmitError extends Error {
  constructor(code) {
    super('KUAJINGZY_' + code);
    this.code=code;
    this.classification=code==='NO_DEBIT_OUT_OF_STOCK'?code:'PRE_SUBMIT_FAILED';
  }
}
export const fail = code => { throw new KuajingZyPreSubmitError(code); };
export const need = (condition, code) => { if (!condition) fail(code); };
const id = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(x);
const decimal = x => typeof x === 'number' && Number.isFinite(x) ? String(x) : x;
export const cny = x => {
  let s = decimal(x);
  if (typeof s === 'string' && /^\d+\.\d+$/.test(s)) s = s.replace(/0+$/,'').replace(/\.$/,'');
  const units = parseKuajingZyCny(s);
  need(typeof x !== 'number' || units <= BigInt(Number.MAX_SAFE_INTEGER), 'NUMERIC_AMOUNT_UNSAFE');
  return s;
};
export const formatCny = n => (n / 10000n) + '.' + String(n % 10000n).padStart(4, '0');

export function parseKuajingZyBinding(raw, productId, skuId) {
  need(raw && raw.fulfillment_source === 'supplier' && raw.supplier === 'kuajingzy'
    && raw.website_product_id === productId && raw.website_sku_id === skuId
    && id(productId) && id(skuId) && id(raw.supplier_product_id)
    && (raw.supplier_sku === null || id(raw.supplier_sku))
    && raw.supplier_currency === 'CNY'
    && typeof raw.supplier_auto_purchase_enabled === 'boolean', 'BINDING_IDENTITY_INVALID');
  const maxUnitCost = cny(raw.supplier_max_unit_cost), minUnitProfit = cny(raw.supplier_min_unit_profit);
  need(parseKuajingZyCny(maxUnitCost) > 0n && parseKuajingZyCny(minUnitProfit) > 0n
    && Number.isSafeInteger(raw.supplier_min_margin_bps)
    && raw.supplier_min_margin_bps >= 0 && raw.supplier_min_margin_bps < 10000, 'BINDING_COST_POLICY_INVALID');
  return Object.freeze({ supplier:'kuajingzy', productId:raw.supplier_product_id, sku:raw.supplier_sku,
    websiteProductId:productId, websiteSkuId:skuId, maxUnitCost, minUnitProfit,
    minMarginBps:raw.supplier_min_margin_bps, enabled:raw.supplier_auto_purchase_enabled });
}

// Dependency-injected core can exercise a future release in synthetic tests.
// Production always passes the literal above, never a request/env override.
export function assertKuajingZyPurchaseGates({ releaseGate = KUAJINGZY_PURCHASE_RELEASE_ENABLED, env, binding }) {
  need(releaseGate === true, 'RELEASE_DISABLED');
  need(env?.SUPPLIER_AUTO_PURCHASE_ENABLED === 'true', 'GLOBAL_DISABLED');
  need(env?.KUAJINGZY_REAL_PURCHASE_ENABLED === 'true', 'SUPPLIER_DISABLED');
  need(binding?.enabled === true, 'BINDING_DISABLED');
  const cap = cny(env.KUAJINGZY_MAX_ORDER_COST_CNY);
  need(parseKuajingZyCny(cap) > 0n, 'ORDER_CAP_REQUIRED');
  return parseKuajingZyCny(cap);
}

export function inspectKuajingZyProduct({ item, pricing, candidate }) {
  const { binding:b, quantity:q } = candidate;
  need(Number.isSafeInteger(q) && q >= 1 && q <= 20, 'QUANTITY_INVALID');
  need(item?.id === b.productId && pricing && (pricing.currency === undefined || pricing.currency === 'CNY'), 'FRESH_PRODUCT_IDENTITY');
  const variants = item.variants;
  need(Array.isArray(variants), 'VARIANT_SCHEMA_INVALID');
  let sku;
  if (variants.length) {
    need(b.sku !== null, 'EXPLICIT_SKU_REQUIRED');
    const matching = variants.filter(x => x.id === b.sku);
    need(matching.length === 1, 'FRESH_SKU_MISMATCH'); sku = matching[0];
  } else {
    need(b.sku === null, 'UNEXPECTED_SKU'); sku = item;
  }
  // Snapshot/advisory only. Positive stock never reserves inventory or becomes
  // the local sellable stock count. A zero/unknown snapshot fails closed.
  need(item.purchasable !== false
    && (item.stock === undefined || (Number.isSafeInteger(item.stock) && item.stock >= q))
    && Number.isSafeInteger(sku.stock) && sku.stock >= q, 'NO_DEBIT_OUT_OF_STOCK');
  need(Number.isSafeInteger(sku.minimum) && q >= sku.minimum
    && (sku.maximum == null || Number.isSafeInteger(sku.maximum) && q <= sku.maximum), 'QUANTITY_LIMIT');
  const price = cny(sku.prices?.CNY);
  need(parseKuajingZyCny(price) > 0n && parseKuajingZyCny(price) === parseKuajingZyCny(cny(sku.unitPrice)), 'CATALOG_PRICE_MISMATCH');
  const discount = decimal(pricing?.memberDiscount);
  const expectedAmount = calculateKuajingZyExpectedAmount({ quantity:q, unitPriceCny:price, memberDiscount:discount });
  need(parseKuajingZyCny(expectedAmount) <= parseKuajingZyCny(b.maxUnitCost) * BigInt(q), 'FROZEN_MAX_COST_EXCEEDED');
  return Object.freeze({ expectedAmount, productId:b.productId, skuId:b.sku, quantity:q });
}

// Revenue/fees use the existing DB's numeric(18,6), without floating point math.
export function micros(value) {
  const s = decimal(value);
  need(typeof s === 'string' && /^(0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(s), 'FINANCIAL_DECIMAL_INVALID');
  const [a,b=''] = s.split('.');
  const units = BigInt(a)*1000000n + BigInt(b.padEnd(6,'0'));
  need(typeof value !== 'number' || units <= BigInt(Number.MAX_SAFE_INTEGER), 'NUMERIC_AMOUNT_UNSAFE');
  return units;
}
export function assertKuajingZyFinancials(candidate, expectedAmount, now = Date.now()) {
  const f = candidate.financials, b = candidate.binding;
  need(f?.source === 'verified_paid_order_allocation' && f.orderId === candidate.orderId
    && f.orderItemId === candidate.orderItemId && f.currency === 'CNY' && f.paymentState === 'paid'
    && Number.isFinite(Date.parse(f.checkedAt)) && Date.parse(f.checkedAt) <= now
    && now - Date.parse(f.checkedAt) <= 60000, 'TRUSTED_FINANCIALS_REQUIRED');
  const revenue = micros(f.paidItemAmount), fees = micros(f.paymentFee) + micros(f.otherFees);
  const cost = parseKuajingZyCny(expectedAmount)*100n;
  const profit = revenue - fees - cost;
  need(revenue > 0n && profit >= parseKuajingZyCny(b.minUnitProfit)*100n*BigInt(candidate.quantity)
    && profit*10000n >= revenue*BigInt(b.minMarginBps), 'MARGIN_INSUFFICIENT');
  return { revenueMicros:revenue.toString(), feeMicros:fees.toString(), profitMicros:profit.toString() };
}

export function getKuajingZyPurchaseGateState(input={}) { return gateState({...input,releaseGate:input.releaseGate??KUAJINGZY_PURCHASE_RELEASE_ENABLED}); }
