// Server-only inventory evidence. No customer flag can opt out of procurement gates.
import { isBitrefillPinEntry } from './pin-order-entry.mjs';

export async function authorizePinLocalOrPurchase({ input, service, authorizePurchase, now = new Date() }) {
  if (!isBitrefillPinEntry(input.skuId)) return { applicable: false };
  if (!service || input.quantity !== 1 || !input.userId || !input.productId
      || typeof input.clientRequestId !== 'string' || !input.clientRequestId.trim()
      || input.clientRequestId.length > 120) throw Error('BITREFILL_LOCAL_ENTRY_INVALID');

  // A completed local order remains replayable after its single PIN is consumed.
  // The SQL replay guard independently validates these frozen item identities.
  const replay = await service.from('orders').select('id,order_items(product_id,sku_id,quantity,product_snapshot)')
    .eq('user_id', input.userId).eq('client_request_id', input.clientRequestId).maybeSingle();
  if (replay.error) throw Error('BITREFILL_LOCAL_REPLAY_READ_FAILED');
  if (replay.data) {
    const items = replay.data.order_items;
    const item = Array.isArray(items) && items.length === 1 ? items[0] : null;
    if (!item || item.product_id !== input.productId || item.sku_id !== input.skuId || item.quantity !== 1) {
      throw Error('BITREFILL_LOCAL_REQUEST_CONFLICT');
    }
    if (!item.product_snapshot?.supplier_binding) return { applicable: true, localInventoryOnly: true, replay: true };
    return authorizePurchase(input);
  }

  const sku = await service.from('product_skus').select('id,product_id,metadata')
    .eq('id', input.skuId).eq('product_id', input.productId).maybeSingle();
  if (sku.error || !sku.data) throw Error('BITREFILL_LOCAL_SKU_READ_FAILED');
  // Local stock must not override an explicit supplier path or a Daju binding.
  if (sku.data.metadata?.fulfillment_source === 'supplier' || sku.data.metadata?.supplier) return authorizePurchase(input);
  const stock = await service.from('digital_inventory').select('id', { count: 'exact', head: true })
    .eq('product_id', input.productId).eq('sku_id', input.skuId).eq('status', 'available')
    .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`);
  if (stock.error || !Number.isSafeInteger(stock.count) || stock.count < 0) throw Error('BITREFILL_LOCAL_STOCK_READ_FAILED');
  if (stock.count >= input.quantity) return { applicable: true, localInventoryOnly: true, replay: false };
  // No purchase, reservation or budget write here. The original closed runtime
  // remains authoritative whenever actual local inventory is insufficient.
  return authorizePurchase(input);
}
