// Trusted server-only dependency boundary. No globals, credentials or HTTP writes.
import { decimalMicros } from './quote-core.mjs';
const fail = code => { throw Error('BITREFILL_' + code); };
const recent = (at, now, ttl) => Number.isFinite(Date.parse(at)) && Date.parse(at) <= now && now - Date.parse(at) <= ttl;
export async function bitrefillRpc(service, name, args) {
  const r = await service.rpc(name, args);
  if (r?.error || !r?.data) fail('PRODUCTION_RPC_FAILED');
  return r.data;
}
async function rows(service, table, columns, field, value) {
  const r = await service.from(table).select(columns).eq(field, value);
  if (r.error || !Array.isArray(r.data)) fail('PRODUCTION_READ_FAILED');
  return r.data;
}
export function createBitrefillProductionLoaders({ service, readonly, catalog, accountFingerprint, authMode,
  trustedCost, settlement, risk, fx, clock = Date.now }) {
  if (!service?.rpc || !service?.from || !readonly?.readBalances || !readonly?.readProductDetails || !catalog?.getProduct ||
      !/^[a-f0-9]{64}$/.test(accountFingerprint ?? '')) fail('PRODUCTION_DEPENDENCIES_REQUIRED');
  async function pricing(candidate) {
    const binding = candidate.orderItem.product_snapshot.supplier_binding;
    const details = await readonly.readProductDetails(binding.supplier_product_id);
    const result = await catalog.getProduct(binding.supplier_product_id), p = result.product;
    const face = String(binding.supplier_face_value);
    const pkg = details.packages.filter(x => x.packageValue === face);
    if (details.accountFingerprint !== accountFingerprint || !recent(details.checkedAt, clock(), 300000) ||
        details.productId !== p.id || details.country !== 'GB' || details.faceCurrency !== 'GBP' ||
        details.recipientType !== 'none' || !details.available || !p.inStock || pkg.length !== 1 ||
        !p.packages.some(x => x.packageId === binding.supplier_sku && String(x.value) === face)) fail('FRESH_PRODUCT_REQUIRED');
    // The observed MCP contract NEVER asserts final fees/debit. A separately
    // verified server adapter must supply a trusted cost, or this remains blocked.
    const quote = trustedCost ? await trustedCost({ binding, details, accountFingerprint }) : null;
    const display = { source: details.source, displayPriceUsd: pkg[0].displayPriceUsd, allInCostVerified: false };
    if (!quote || quote.source !== 'authenticated_supplier_cost' || quote.feesIncluded !== true ||
        quote.supplierEnforcedDebitCap !== true || quote.accountFingerprint !== accountFingerprint || quote.currency !== 'USD' ||
        quote.productId !== binding.supplier_product_id || quote.packageId !== binding.supplier_sku ||
        !recent(quote.checkedAt, clock(), 300000) || !Number.isFinite(Date.parse(quote.expiresAt)) || Date.parse(quote.expiresAt) <= clock() ||
        Date.parse(quote.expiresAt) > Date.parse(quote.checkedAt) + 300000 ||
        decimalMicros(quote.allInUsd) <= 0n) fail('TRUSTED_PREPURCHASE_ALL_IN_COST_NOT_AVAILABLE');
    return { display, quote: { ...quote, authMode }, productCheckedAt: details.checkedAt,
      catalogRaw: { id:p.id, name:p.name, country_code:p.country, currency:p.currency, in_stock:p.inStock,
        recipient_type:details.recipientType, packages:p.packages.map(x => ({ id:x.packageId, value:x.value, ...(x.price === null ? {} : { price:x.price }) })) } };
  }
  async function financial({ order, orderItem }) {
    const orders = await rows(service, 'orders', 'id,status,payment_status,currency,refund_status,refunded_amount', 'id', order.id);
    const items = await rows(service, 'order_items', 'id,order_id,sku_id,quantity,unit_price', 'id', orderItem.id);
    const o = orders[0], i = items[0];
    if (orders.length !== 1 || items.length !== 1 || o.payment_status !== 'paid' ||
        !['paid','processing','delivered','completed'].includes(o.status) || o.currency !== 'CNY' || i.order_id !== o.id ||
        i.sku_id !== orderItem.sku_id || i.quantity !== 1 || String(i.unit_price) !== String(orderItem.unit_price)) fail('PIN_PAID_LEDGER_REQUIRED');
    const refunds = await rows(service, 'refund_requests', 'status', 'order_id', o.id);
    if (o.refund_status !== 'none' || Number(o.refunded_amount) !== 0 || refunds.some(r => !['rejected','cancelled'].includes(r.status))) fail('PIN_REFUND_OR_DISPUTE');
    const privateBinding = await bitrefillRpc(service, 'internal_bitrefill_pin_read_order_binding', { p_order_item_id:i.id });
    if (privateBinding.pin_account_fingerprint !== accountFingerprint || (privateBinding.pin_auth_mode ?? 'business') !== authMode) fail('PIN_ORDER_AUTHORIZATION_DRIFT');
    // Actual paid allocation/fees and risk attestations must be server-derived;
    // missing refund/dispute or fee evidence is NOT interpreted as a free/clear order.
    const paid = settlement ? await settlement({ service, order:o, orderItem:i }) : null;
    const riskEvidence = risk ? await risk({ service, order:o, orderItem:i }) : null;
    if (!paid || paid.source !== 'authenticated_paid_allocation' || paid.orderId !== o.id || paid.orderItemId !== i.id ||
        paid.currency !== 'CNY' || paid.cnyFeesVerified !== true || decimalMicros(paid.paidItemAmount) <= 0n ||
        decimalMicros(paid.paidItemAmount) > decimalMicros(String(i.unit_price)) || decimalMicros(paid.additionalCnyCost) < 0n ||
        !recent(paid.checkedAt, clock(), 60000)) fail('PIN_TRUSTED_SETTLEMENT_REQUIRED');
    if (riskEvidence?.source !== 'authenticated_order_risk' || riskEvidence.orderId !== o.id ||
        riskEvidence.disputeState !== 'none' || !recent(riskEvidence.checkedAt, clock(), 60000)) fail('PIN_REFUND_OR_DISPUTE');
    const rate = fx ? await fx({ service, order:o }) : null;
    if (!rate || rate.approvedSettlementSource !== true || rate.from !== 'USD' || rate.to !== 'CNY' ||
        !recent(rate.checkedAt, clock(), 300000) || !Number.isFinite(Date.parse(rate.expiresAt)) || Date.parse(rate.expiresAt) <= clock() ||
        Date.parse(rate.expiresAt) > Date.parse(rate.checkedAt) + 300000) fail('FX_STALE_OR_UNVERIFIED');
    return { source:'authenticated_paid_ledger', orderId:o.id, orderItemId:i.id, currency:'CNY', paymentState:'paid',
      refundState:'none', disputeState:'none', paidItemAmount:paid.paidItemAmount, additionalCnyCost:paid.additionalCnyCost,
      additionalCnyCostsVerified:true, fx:rate, authMode, credentialVerified:true,
      // Personal permission is explicit operator risk acceptance, not Business approval.
      personalUseAuthorized:authMode === 'personal', personalAuthorizationReference:privateBinding.pin_authorization_reference,
      businessCredentialsVerified:authMode === 'business', resaleScopeApproved:authMode === 'business',
      typedFulfillmentVerified:true, authoritativeReconciliationVerified:true, atomicBudgetReservationReady:true,
      boundedSpendAuthorized:true, authorizationReference:privateBinding.pin_authorization_reference,
      cumulativeCapUsd:privateBinding.pin_cumulative_cap_usd };
  }
  async function balance(candidate, quote) {
    const b = await readonly.readBalances();
    const usd = b.balances.filter(x => x.paymentMethod === 'balance' && x.currency === 'USD');
    if (b.source !== 'authenticated_mcp_balances' || b.accountFingerprint !== accountFingerprint || usd.length !== 1 ||
        !recent(b.checkedAt, clock(), 60000) || quote.accountFingerprint !== accountFingerprint ||
        decimalMicros(usd[0].availableAmount) < decimalMicros(quote.allInUsd)) fail('SUPPLIER_BALANCE_MANUAL_REVIEW');
    const totals = await bitrefillRpc(service, 'internal_bitrefill_pin_budget_totals', { p_sku:candidate.orderItem.sku_id, p_account:accountFingerprint });
    return { source:'authenticated_supplier_balance', accountFingerprint, currency:'USD', availableAmount:usd[0].availableAmount,
      checkedAt:b.checkedAt, reservedUsd:totals.reservedUsd, spentUsd:totals.spentUsd };
  }
  return Object.freeze({ loadPricing:pricing, loadFinancialEvidence:financial, loadSupplierBalance:balance });
}
