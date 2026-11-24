import { parseKuajingZyCny } from './mall-order-contract.mjs';
import { need } from './purchase-policy.mjs';

export const KUAJINGZY_PURCHASE_RELEASE_MODE = 'full_production';

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const ALLOWED_PAYMENT_METHODS = new Set(['balance', 'alipay', 'wechat', 'wechat_pay', 'usdt_bep20']);

// Full production scope: enforces authenticated buyer identity, supported payment
// methods, bounded per-order quantity, enabled supplier binding and server order cap.
export function assertKuajingZyCanaryScope({ orderUserId, paymentMethod, binding, quantity }, _env, cap) {
  need(typeof orderUserId === 'string' && UUID.test(orderUserId)
    && ALLOWED_PAYMENT_METHODS.has(paymentMethod)
    && Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 20
    && binding?.enabled === true
    && typeof cap === 'bigint' && cap > 0n
    && parseKuajingZyCny(binding.maxUnitCost) > 0n,
  'CANARY_SCOPE_DENIED');
}
