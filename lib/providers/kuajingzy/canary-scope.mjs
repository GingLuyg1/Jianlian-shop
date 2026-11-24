import { parseKuajingZyCny } from './mall-order-contract.mjs';
import { need } from './purchase-policy.mjs';

export const KUAJINGZY_PURCHASE_RELEASE_MODE = 'single_user_canary';

const PRODUCT_ID = 'a7f38339-30da-54b8-94ef-a71297e2ea0e';
const SKU_ID = '5b74a961-4e34-5542-9ae8-030abf8651c1';
const SUPPLIER_PRODUCT_ID = 'imp_9b99e012b51156686bbda185';
const SUPPLIER_SKU = '16';
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
