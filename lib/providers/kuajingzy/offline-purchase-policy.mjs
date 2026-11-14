// Pure internal planning only: NO HTTP client, secrets, persistence, registry, or submit method.
// Input DTOs below are not claims about the supplier's unverified order response.
import { buildSupplierPurchaseIdentity, classifySupplierSubmitBoundary } from '../core/purchase-identity-core.mjs';
import {
  auditKuajingZyMallOrder, calculateKuajingZyExpectedAmount, freezeKuajingZyMallRequest,
  matchesKuajingZyFrozenRequest, parseKuajingZyCny,
} from './mall-order-contract.mjs';
export { parseKuajingZyCny };
const need=(condition,code)=>{if(!condition)throw new Error('KUAJINGZY_'+code);};
const cny=n=>`${n/10000n}.${String(n%10000n).padStart(4,'0')}`;
export function prepareKuajingZyOfflinePurchase({binding,expectedSkuId,orderItemId,attemptId,quantity,quote,policy,nowMs}={}){
  need(binding?.supplier==='kuajingzy'&&typeof expectedSkuId==='string'&&expectedSkuId.length>0&&binding.websiteSkuId===expectedSkuId&&binding.supplierProductId&&binding.bindingStatus==='candidate_unverified','BINDING_MISMATCH');
  need(Number.isSafeInteger(quantity)&&quantity>=1&&quantity<=20,'QUANTITY_INVALID');
  need(policy?.paused===false&&policy.emergencyStop===false,'PURCHASE_PAUSED');
  need(quote?.currency==='CNY'&&quote.productId===binding.supplierProductId&&quote.quantity===quantity&&
    typeof quote.specificationKey==='string'&&quote.specificationKey.length>0&&quote.specificationKey===policy.expectedSpecificationKey,'QUOTE_IDENTITY_MISMATCH');
  need(quote.costAuthoritative===true&&quote.feesIncluded===true,'FINAL_COST_UNVERIFIED');
  need(Number.isSafeInteger(nowMs)&&Number.isSafeInteger(quote.quotedAtMs)&&Number.isSafeInteger(quote.expiresAtMs)&&
    Number.isSafeInteger(policy.maxQuoteAgeMs)&&policy.maxQuoteAgeMs>0&&quote.quotedAtMs<=nowMs&&
    nowMs<quote.expiresAtMs&&nowMs-quote.quotedAtMs<=policy.maxQuoteAgeMs,'QUOTE_STALE');
  need(quote.stockAuthoritative===true&&Number.isSafeInteger(quote.availableQuantity)&&quote.availableQuantity>=quantity,'STOCK_UNVERIFIED_OR_INSUFFICIENT');
  const total=parseKuajingZyCny(quote.totalIncludingFees),single=parseKuajingZyCny(policy.singleLimit),
    cumulative=parseKuajingZyCny(policy.cumulativeLimit),spent=parseKuajingZyCny(policy.spent),reserved=parseKuajingZyCny(policy.reserved),
    balance=parseKuajingZyCny(policy.balance),revenue=parseKuajingZyCny(policy.saleRevenue),salesFees=parseKuajingZyCny(policy.salesFees);
  need(total>0n&&total<=single,'SINGLE_LIMIT_EXCEEDED');
  need(spent+reserved+total<=cumulative,'CUMULATIVE_LIMIT_EXCEEDED');
  need(reserved+total<=balance,'BALANCE_INSUFFICIENT');
  need(Number.isSafeInteger(policy.minimumMarginBps)&&policy.minimumMarginBps>=0&&policy.minimumMarginBps<10000,'MARGIN_POLICY_INVALID');
  need(revenue>0n&&(revenue-salesFees-total)*10000n>=revenue*BigInt(policy.minimumMarginBps),'MARGIN_INSUFFICIENT');
  const expectedAmount = calculateKuajingZyExpectedAmount({
    quantity, unitPriceCny: quote.unitPriceCny, memberDiscount: quote.memberDiscount,
  });
  need(total === parseKuajingZyCny(expectedAmount), 'QUOTE_AMOUNT_MISMATCH');
  const requestId='kuajingzy:'+orderItemId;
  need(quote.skuId === null || quote.skuId === quote.specificationKey, 'QUOTE_SKU_UNVERIFIED');
  const frozenRequest = freezeKuajingZyMallRequest({
    key: requestId, itemId: binding.supplierProductId, skuId: quote.skuId ?? undefined, quantity, expectedAmount,
  });
  const frozen=buildSupplierPurchaseIdentity({provider:'kuajingzy',orderItemId,requestId,attemptId,
    productId:binding.supplierProductId,packageId:quote.specificationKey,quantity,amount:cny(total),currency:'CNY'});
  return Object.freeze({requestId,frozenRequest,expectedAmount,semanticHash:frozen.semanticHash,frozenIdentity:Object.freeze(frozen.identity),
    maximumTotalDebitCny:cny(total),profitAfterKnownFeesCny:cny(revenue-salesFees-total),
    financialSimulationPass:true,canSubmit:false,requiresAtomicBudgetReservation:true,
    blockReasons:['LIVE_CATALOG_AND_ORDER_CONTRACTS_UNVERIFIED','DURABLE_STORE_NOT_WIRED','REAL_PURCHASE_NOT_AUTHORIZED']});
}
export function decideKuajingZyOfflineContinuation(input={}){
  const closed=next=>Object.freeze({next,canSubmit:false,retryPurchase:false});
  if(input.paused!==false)return closed('PAUSED');
  if(!/^[a-f0-9]{64}$/.test(input.expectedIdentityHash??'')||input.expectedIdentityHash!==input.storedIdentityHash)return closed('MANUAL_REVIEW');
  if(input.deliveryCommitted===true)return closed('ALREADY_DELIVERED');
  if (input.submitMayHaveLeft === true && !input.externalOrderId) {
    if (matchesKuajingZyFrozenRequest(input.storedRequest, input.proposedRequest)) {
      return closed('RECOVER_SAME_REQUEST_ONLY');
    }
    return closed('MANUAL_REVIEW');
  }
  // Prefer the existing query-only path whenever the original order ID is known.
  const shared=classifySupplierSubmitBoundary({submitMayHaveLeft:input.submitMayHaveLeft,durableState:input.durableState,externalInvoiceId:input.externalOrderId});
  return closed(shared.next==='REVALIDATE_FROZEN_REQUEST'?'REVALIDATE_ONLY':shared.next);
}
export function validateKuajingZyOfflineDelivery({expected,observed,authoritativeGet,privateStorageReady,deliveryCommitted}={}){
  const closed=code=>Object.freeze({eligibleForExistingPrivateDelivery:false,code,canSubmit:false});
  if(deliveryCommitted===true)return closed('ALREADY_DELIVERED');
  if(authoritativeGet!==true||privateStorageReady!==true)return closed('PRIVATE_DELIVERY_OR_GET_UNVERIFIED');
  const audit = auditKuajingZyMallOrder({
    expected: expected && {
      id: expected.externalOrderId, itemId: expected.productId, skuId: expected.skuId,
      quantity: expected.quantity, expectedAmount: expected.maximumTotalDebitCny,
    },
    order: observed,
  });
  if (!audit.deliveryEligible) return closed(audit.code);
  return Object.freeze({
    eligibleForExistingPrivateDelivery: true, code: audit.code, deliveredCount: audit.deliveredCount,
    requiresAtomicExistingStore: true, canSubmit: false,
  });
}
