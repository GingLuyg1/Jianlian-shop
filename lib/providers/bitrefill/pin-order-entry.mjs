// Server-side only. No supplier debit occurs here; no customer cost/permission
// assertion is accepted. SQL independently validates the private quote ticket.
import { assertPinTransport } from './pin-policy.mjs';
import { createBitrefillPinFulfillment } from './pin-fulfillment.mjs';

export const GIFFGAFF_PIN_SKUS = Object.freeze([
  'eeef050f-3b56-492d-a0a2-0640e4c1355f',
  '4cf72256-72ca-47b0-8dca-9904a0d70f69',
  'f1333d43-8f0b-4041-a120-c980f7e58147',
]);
export const isBitrefillPinEntry = skuId => GIFFGAFF_PIN_SKUS.includes(skuId);

// A server release composes both entry and paid delivery from the same account
// transport. Constructing this pair neither installs it nor opens live sales.
export function createBitrefillPinOrderRuntime({ service, loadOrderEvidence, ...purchaseDependencies }) {
  return Object.freeze({
    authorizeOrder:createBitrefillPinOrderAuthorizer({ service, transport:purchaseDependencies.transport, loadEvidence:loadOrderEvidence }),
    fulfillPaidOrder:createBitrefillPinFulfillment(purchaseDependencies),
  });
}

export function createBitrefillPinOrderAuthorizer({ service, transport, loadEvidence }) {
  const synthetic = assertPinTransport(transport);
  if (!service?.rpc || typeof loadEvidence !== 'function') throw Error('BITREFILL_PIN_ENTRY_DEPENDENCIES_REQUIRED');
  return async ({ userId, productId, skuId, quantity, clientRequestId }) => {
    if (!isBitrefillPinEntry(skuId)) return { applicable: false };
    if (quantity !== 1 || typeof clientRequestId !== 'string' || !clientRequestId.trim() || clientRequestId.length > 120 ||
        clientRequestId !== clientRequestId.trim()) throw Error('BITREFILL_PIN_ENTRY_REQUEST_INVALID');
    const args = { p_user:userId, p_request:clientRequestId, p_product:productId, p_sku:skuId };
    const status = await service.rpc('internal_bitrefill_pin_entry_status', args);
    if (status.error || !status.data) throw Error('BITREFILL_PIN_ENTRY_STATUS_FAILED');
    if (status.data.replay === true) return { applicable:true, replay:true };
    if (status.data.enabled !== true) throw Error('BITREFILL_PIN_SALE_CLOSED');
    const evidence = await loadEvidence({ userId, productId, skuId, authorization:status.data.authorization });
    if (evidence?.source !== (synthetic ? 'synthetic_pin_order_quote' : 'authenticated_pin_order_quote')) throw Error('BITREFILL_PIN_ENTRY_SOURCE_INVALID');
    const result = await service.rpc('internal_bitrefill_pin_authorize_quote', { ...args, p_evidence:evidence });
    if (result.error || !result.data?.quote_id) throw Error('BITREFILL_PIN_ENTRY_QUOTE_REJECTED');
    return { applicable:true, replay:result.data.replay === true };
  };
}
