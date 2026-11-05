import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareKuajingZyOfflinePurchase as plan,parseKuajingZyCny as cny,decideKuajingZyOfflineContinuation as next,validateKuajingZyOfflineDelivery as delivery} from '../../lib/providers/kuajingzy/offline-purchase-policy.mjs';
function fixture(){return {binding:{supplier:'kuajingzy',websiteSkuId:'SKU-1',supplierProductId:'P-1',bindingStatus:'candidate_unverified'},expectedSkuId:'SKU-1',orderItemId:'ITEM-1',attemptId:'00000000-0000-4000-8000-000000000001',quantity:1,nowMs:10000,
  quote:{currency:'CNY',productId:'P-1',quantity:1,specificationKey:'SYNTHETIC-FIXED',costAuthoritative:true,feesIncluded:true,totalIncludingFees:'8.0000',stockAuthoritative:true,availableQuantity:1,quotedAtMs:9000,expiresAtMs:11000},
  policy:{paused:false,emergencyStop:false,expectedSpecificationKey:'SYNTHETIC-FIXED',maxQuoteAgeMs:2000,singleLimit:'10',cumulativeLimit:'100',spent:'20',reserved:'10',balance:'50',saleRevenue:'10',salesFees:'0.5',minimumMarginBps:1500}};}
test('precise CNY accepts four decimals only and never financial binary floats',()=>{
  assert.equal(cny('999999999999.9999'),9999999999999999n);assert.equal(cny('0.0001'),1n);
  for(const value of [1.1,'1.00001','-1','1e3',' 1','01','Infinity'])assert.throws(()=>cny(value),/CNY_AMOUNT_INVALID/);
});
test('offline cost gate handles exact margin boundary without opening purchase',()=>{
  const p=plan(fixture());assert.equal(p.profitAfterKnownFeesCny,'1.5000');assert.equal(p.maximumTotalDebitCny,'8.0000');
  assert.equal(p.canSubmit,false);assert.equal(p.requiresAtomicBudgetReservation,true);assert.equal(p.requestId,'kuajingzy:ITEM-1');
  assert.equal(p.semanticHash,plan(fixture()).semanticHash);const f=fixture();f.quote.totalIncludingFees='8';assert.equal(p.semanticHash,plan(f).semanticHash);
});
const failures=[
 ['SKU mismatch',f=>{f.expectedSkuId='OTHER';},'BINDING_MISMATCH'],
 ['product drift',f=>{f.quote.productId='OTHER';},'QUOTE_IDENTITY_MISMATCH'],
 ['spec drift',f=>{f.quote.specificationKey='OTHER';},'QUOTE_IDENTITY_MISMATCH'],
 ['quantity drift',f=>{f.quote.quantity=2;},'QUOTE_IDENTITY_MISMATCH'],
 ['USD quote',f=>{f.quote.currency='USD';},'QUOTE_IDENTITY_MISMATCH'],
 ['unknown final fees',f=>{f.quote.feesIncluded=false;},'FINAL_COST_UNVERIFIED'],
 ['display cost',f=>{f.quote.costAuthoritative=false;},'FINAL_COST_UNVERIFIED'],
 ['stock insufficient',f=>{f.quote.availableQuantity=0;},'STOCK_UNVERIFIED_OR_INSUFFICIENT'],
 ['unknown stock',f=>{f.quote.stockAuthoritative=false;},'STOCK_UNVERIFIED_OR_INSUFFICIENT'],
 ['stale quote',f=>{f.nowMs=11000;},'QUOTE_STALE'],
 ['future quote',f=>{f.quote.quotedAtMs=10001;},'QUOTE_STALE'],
 ['single cap',f=>{f.policy.singleLimit='7.9999';},'SINGLE_LIMIT_EXCEEDED'],
 ['cumulative cap includes reserved',f=>{f.policy.cumulativeLimit='37.9999';},'CUMULATIVE_LIMIT_EXCEEDED'],
 ['balance includes reserved',f=>{f.policy.balance='17.9999';},'BALANCE_INSUFFICIENT'],
 ['margin one minor unit short',f=>{f.quote.totalIncludingFees='8.0001';},'MARGIN_INSUFFICIENT'],
 ['manual pause',f=>{f.policy.paused=true;},'PURCHASE_PAUSED'],
 ['emergency stop',f=>{f.policy.emergencyStop=true;},'PURCHASE_PAUSED'],
];
for(const [name,change,code] of failures)test(name+' fails closed',()=>{const f=fixture();change(f);assert.throws(()=>plan(f),new RegExp(code));});
test('unknown or timed out submit never retries and only queries a persisted original order',()=>{
  const base={paused:false,expectedIdentityHash:'a'.repeat(64),storedIdentityHash:'a'.repeat(64),submitMayHaveLeft:true,durableState:'SUBMITTING',externalOrderId:'ORIGINAL'};
  assert.equal(next(base).next,'QUERY_ONLY');assert.equal(next({...base,externalOrderId:null}).next,'MANUAL_REVIEW');
  assert.equal(next({...base,submitMayHaveLeft:undefined}).next,'MANUAL_REVIEW');
  assert.equal(next({...base,submitMayHaveLeft:false,durableState:'BEFORE_SUBMIT'}).next,'REVALIDATE_ONLY');
  assert.equal(next({...base,storedIdentityHash:'b'.repeat(64)}).next,'MANUAL_REVIEW');
  assert.equal(next({...base,deliveryCommitted:true}).next,'ALREADY_DELIVERED');
  for(const changed of [base,{...base,externalOrderId:null},{...base,submitMayHaveLeft:false,durableState:'BEFORE_SUBMIT'}]){
    assert.equal(next(changed).canSubmit,false);assert.equal(next(changed).retryPurchase,false);
  }
});
function delivered(){const expected={requestId:'REQ',externalOrderId:'ORDER',productId:'P-1',specificationKey:'SPEC',currency:'CNY',quantity:1,maximumTotalDebitCny:'8'};return {expected,observed:{...expected,status:'delivered',deliveredCount:1,totalDebitCny:'8'},authoritativeGet:true,privateStorageReady:true,deliveryCommitted:false};}
test('private delivery decision validates every frozen identity field and exact count',()=>{
  const f=delivered();assert.equal(delivery(f).eligibleForExistingPrivateDelivery,true);
  assert.equal(delivery(f).requiresAtomicExistingStore,true);
  for(const key of ['requestId','externalOrderId','productId','specificationKey','currency','quantity']){
    const g=delivered();g.observed[key]=key==='quantity'?2:'OTHER';assert.equal(delivery(g).eligibleForExistingPrivateDelivery,false);
    delete g.expected[key];assert.equal(delivery(g).eligibleForExistingPrivateDelivery,false);
  }
});
test('unknown or excess final debit forbids automatic delivery/audit success',()=>{
  const f=delivered();f.observed.totalDebitCny='8.0001';assert.equal(delivery(f).code,'DELIVERY_DEBIT_OUTSIDE_CAP');
  delete f.observed.totalDebitCny;assert.equal(delivery(f).code,'DELIVERY_DEBIT_UNVERIFIED');
});
test('unknown/partial/undelivered, repeated delivery, and public storage refuse delivery',()=>{
  for(const state of ['unknown','partial','processing','completed']){const f=delivered();f.observed.status=state;assert.equal(delivery(f).eligibleForExistingPrivateDelivery,false);}
  assert.equal(delivery({...delivered(),deliveryCommitted:true}).code,'ALREADY_DELIVERED');
  assert.equal(delivery({...delivered(),privateStorageReady:false}).eligibleForExistingPrivateDelivery,false);
  assert.equal(delivery({...delivered(),authoritativeGet:false}).eligibleForExistingPrivateDelivery,false);
});
test('no PIN payload, credentials, real transport or registry hooks in offline policy',()=>{
  const f=delivered();f.observed.pin='SYNTHETIC_PRIVATE_PIN';f.observed.apiKey='SYNTHETIC_KEY';
  const result=JSON.stringify(delivery(f));assert.equal(result.includes('SYNTHETIC_PRIVATE_PIN'),false);assert.equal(result.includes('SYNTHETIC_KEY'),false);
  const source=readFileSync(new URL('../../lib/providers/kuajingzy/offline-purchase-policy.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/fetch\(|https?:\/\/|process\.env|\.rpc\(/);
});
