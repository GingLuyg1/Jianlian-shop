// One process-local server composition point for the two halves of the same
// approved runtime. Default remains closed. No credentials or fake transports.
import { assertBitrefillRealPurchaseEnabled, REAL_BITREFILL_PURCHASE_ENABLED } from './prelaunch-policy.mjs';
import { isBitrefillPinEntry } from './pin-order-entry.mjs';
let runtime = null;
export function installBitrefillPinRuntime({ authorizeOrder, fulfillPaidOrder }) {
  assertBitrefillRealPurchaseEnabled();
  if (runtime || typeof authorizeOrder !== 'function' || typeof fulfillPaidOrder !== 'function') throw Error('BITREFILL_PIN_RUNTIME_INVALID');
  runtime = Object.freeze({ authorizeOrder, fulfillPaidOrder });
}
export function getBitrefillPinHandler() {
  return REAL_BITREFILL_PURCHASE_ENABLED ? runtime?.fulfillPaidOrder : undefined;
}
export async function authorizeBitrefillPinOrder(input) {
  if (!isBitrefillPinEntry(input.skuId)) return { applicable:false };
  if (!REAL_BITREFILL_PURCHASE_ENABLED || !runtime) throw Error('BITREFILL_PIN_SALE_CLOSED');
  return runtime.authorizeOrder(input);
}
