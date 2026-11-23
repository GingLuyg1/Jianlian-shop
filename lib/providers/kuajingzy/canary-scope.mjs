import { parseKuajingZyCny } from './mall-order-contract.mjs';
import { need } from './purchase-policy.mjs';

export const KUAJINGZY_PURCHASE_RELEASE_MODE = 'single_user_canary';

const PRODUCT_ID = 'ab4930de-5eef-4a40-9362-83ed6da9ea71';
const SKU_ID = 'c34de5ce-bd2a-4356-aa2a-ca7ed4c3e4cd';
const SUPPLIER_PRODUCT_ID = 'imp_8f97c91003b23347934cb14e';
const SUPPLIER_SKU = '9';
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const MAX_ORDER_COST = parseKuajingZyCny('0.10');
const MAX_UNIT_COST = parseKuajingZyCny('0.0990');

// Server purchase and order entry are the only callers. The UUID comes from
// the server environment and is compared with authenticated or persisted identity.
export function assertKuajingZyCanaryScope({ orderUserId, paymentMethod, binding, quantity }, env, cap) {
  const allowedUserId = env.KUAJINGZY_CANARY_USER_ID;
  need(typeof allowedUserId === 'string' && UUID.test(allowedUserId)
    && orderUserId === allowedUserId
    && paymentMethod === 'balance' && quantity === 1
    && binding.websiteProductId === PRODUCT_ID && binding.websiteSkuId === SKU_ID
    && binding.productId === SUPPLIER_PRODUCT_ID && binding.sku === SUPPLIER_SKU
    && cap <= MAX_ORDER_COST && parseKuajingZyCny(binding.maxUnitCost) <= MAX_UNIT_COST,
  'CANARY_SCOPE_DENIED');
}
