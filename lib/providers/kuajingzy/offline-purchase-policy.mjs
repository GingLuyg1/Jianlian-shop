// Pure internal planning only: NO HTTP client, secrets, persistence, registry, or submit method.
// Input DTOs below are not claims about the supplier's unverified order response.
import { buildSupplierPurchaseIdentity, classifySupplierSubmitBoundary } from '../core/purchase-identity-core.mjs';
const need=(condition,code)=>{if(!condition)throw new Error('KUAJINGZY_'+code);};
export function parseKuajingZyCny(value){
  need(typeof value==='string'&&/^(0|[1-9]\d{0,11})(?:\.\d{1,4})?$/.test(value),'CNY_AMOUNT_INVALID');
  const [whole,frac='']=value.split('.');return BigInt(whole)*10000n+BigInt(frac.padEnd(4,'0'));
}
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
  const requestId='kuajingzy:'+orderItemId;
  const frozen=buildSupplierPurchaseIdentity({provider:'kuajingzy',orderItemId,requestId,attemptId,
    productId:binding.supplierProductId,packageId:quote.specificationKey,quantity,amount:cny(total),currency:'CNY'});
  return Object.freeze({requestId,semanticHash:frozen.semanticHash,frozenIdentity:Object.freeze(frozen.identity),
    maximumTotalDebitCny:cny(total),profitAfterKnownFeesCny:cny(revenue-salesFees-total),
    financialSimulationPass:true,canSubmit:false,requiresAtomicBudgetReservation:true,
    blockReasons:['LIVE_CATALOG_AND_ORDER_CONTRACTS_UNVERIFIED','DURABLE_STORE_NOT_WIRED','REAL_PURCHASE_NOT_AUTHORIZED']});
}
export function decideKuajingZyOfflineContinuation(input={}){
  const closed=next=>Object.freeze({next,canSubmit:false,retryPurchase:false});
  if(input.paused!==false)return closed('PAUSED');
  if(!/^[a-f0-9]{64}$/.test(input.expectedIdentityHash??'')||input.expectedIdentityHash!==input.storedIdentityHash)return closed('MANUAL_REVIEW');
  if(input.deliveryCommitted===true)return closed('ALREADY_DELIVERED');
  // The shared core decides uncertain/query-only boundaries; this provider never submits.
  const shared=classifySupplierSubmitBoundary({submitMayHaveLeft:input.submitMayHaveLeft,durableState:input.durableState,externalInvoiceId:input.externalOrderId});
  return closed(shared.next==='REVALIDATE_FROZEN_REQUEST'?'REVALIDATE_ONLY':shared.next);
}
export function validateKuajingZyOfflineDelivery({expected,observed,authoritativeGet,privateStorageReady,deliveryCommitted}={}){
  const closed=code=>Object.freeze({eligibleForExistingPrivateDelivery:false,code,canSubmit:false});
  if(deliveryCommitted===true)return closed('ALREADY_DELIVERED');
  if(authoritativeGet!==true||privateStorageReady!==true)return closed('PRIVATE_DELIVERY_OR_GET_UNVERIFIED');
  if(!expected||!observed||!['requestId','externalOrderId','productId','specificationKey','currency','quantity'].every(k=>
    expected[k]!==undefined&&expected[k]!==null&&expected[k]!==''&&expected[k]===observed[k]))return closed('DELIVERY_IDENTITY_MISMATCH');
  if(observed.status!=='delivered'||observed.deliveredCount!==expected.quantity||!Number.isSafeInteger(expected.quantity)||expected.quantity<1||expected.quantity>20||expected.currency!=='CNY')return closed('DELIVERY_NOT_CONFIRMED');
  try{
    const actual=parseKuajingZyCny(observed.totalDebitCny),maximum=parseKuajingZyCny(expected.maximumTotalDebitCny);
    if(actual<=0n||actual>maximum)return closed('DELIVERY_DEBIT_OUTSIDE_CAP');
  }catch{return closed('DELIVERY_DEBIT_UNVERIFIED');}
  // This result contains no PIN. The existing private transactional store must consume it once.
  return Object.freeze({eligibleForExistingPrivateDelivery:true,code:'SYNTHETIC_IDENTITY_MATCH',requiresAtomicExistingStore:true,canSubmit:false});
}
