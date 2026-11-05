// Reuse the existing orchestrator with an in-memory test double, not a new runtime store.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fulfillSupplierCandidates} from '../../lib/providers/core/fulfillment-core.mjs';
import {decideKuajingZyOfflineContinuation,validateKuajingZyOfflineDelivery} from '../../lib/providers/kuajingzy/offline-purchase-policy.mjs';
function fixture({timeout=false,knownOrder=true}={}){
  let state='NEW',externalOrderId=null,purchases=0,queries=0,deliveries=0,privatePin=null;
  const requestId='kuajingzy:ITEM',hash='a'.repeat(64),identity={requestId,externalOrderId:'SUPPLIER-ORDER',productId:'P-1',specificationKey:'SYNTHETIC',currency:'CNY',quantity:1};
  const result={...identity,status:'delivered',deliveredCount:1,totalDebitCny:'8',pin:'SYNTHETIC_PRIVATE_PIN'};
  const store={
    async claim(){
      if(state==='NEW'){state='PURCHASING';return {action:'PURCHASE',status:state,orderCode:null};}
      const d=decideKuajingZyOfflineContinuation({paused:false,expectedIdentityHash:hash,storedIdentityHash:hash,
        durableState:state,submitMayHaveLeft:true,externalOrderId,deliveryCommitted:state==='FULFILLED'});
      return {action:d.next==='QUERY_ONLY'?'QUERY':'NONE',status:state,orderCode:externalOrderId};
    },
    async recordOutcome(o){
      if(o.state==='FULFILLED'){
        if(state==='FULFILLED')return;
        assert.equal(o.deliveredContent,result.pin);privatePin=o.deliveredContent;deliveries++;
      }
      state=o.state;externalOrderId=o.orderCode??externalOrderId;
    },
  };
  const input={candidates:[{orderId:'ORDER',orderItemId:'ITEM',quantity:1,binding:{productId:'P-1',sku:'SYNTHETIC'},orderFields:{}}],
    store,triggerSource:'synthetic_only',createRequestId:()=>requestId,
    client:{async getProduct(){return {price:'8'};},async purchase(){purchases++;if(timeout){const e=new Error('SYNTHETIC_SECRET');e.code='TIMEOUT';e.orderCode=knownOrder?'SUPPLIER-ORDER':null;throw e;}return result;},async getOrder(id){queries++;assert.equal(id,'SUPPLIER-ORDER');return result;}},
    validateReadiness:()=>({ok:true,inputs:{}}),decideError:()=>({state:'UNCERTAIN',retryable:false,code:'TIMEOUT'}),
    decideOrderResult:o=>validateKuajingZyOfflineDelivery({expected:{...identity,maximumTotalDebitCny:'8'},observed:o,authoritativeGet:true,privateStorageReady:true,deliveryCommitted:state==='FULFILLED'}).eligibleForExistingPrivateDelivery
      ?{kind:'fulfilled'}:{kind:'uncertain',code:'DELIVERY_NOT_CONFIRMED'},
    extractDeliveredContent:o=>o.pin,
    outcome:(_candidate,_claim,_requestId,nextState,retryable,code,extra={})=>({state:nextState,retryable,code,...extra}),
  };
  return {input,get counters(){return {purchases,queries,deliveries,state};},get hasPrivatePin(){return privatePin===result.pin;}};
}
test('existing orchestration + atomic claim test double handles duplicate tasks and delivery once',async()=>{
  const f=fixture();const summaries=await Promise.all([fulfillSupplierCandidates(f.input),fulfillSupplierCandidates(f.input)]);
  await fulfillSupplierCandidates(f.input);
  assert.deepEqual(f.counters,{purchases:1,queries:0,deliveries:1,state:'FULFILLED'});assert.equal(f.hasPrivatePin,true);
  assert.equal(JSON.stringify(summaries).includes('SYNTHETIC_PRIVATE_PIN'),false);
});
test('unknown submit with durable original ID reconciles once, never purchases twice',async()=>{
  const f=fixture({timeout:true});await fulfillSupplierCandidates(f.input);assert.equal(f.counters.state,'UNCERTAIN');
  await fulfillSupplierCandidates(f.input);await fulfillSupplierCandidates(f.input);
  assert.deepEqual(f.counters,{purchases:1,queries:1,deliveries:1,state:'FULFILLED'});
});
test('unknown submit without original ID remains stopped/manual; cannot retry purchase',async()=>{
  const f=fixture({timeout:true,knownOrder:false});await fulfillSupplierCandidates(f.input);await fulfillSupplierCandidates(f.input);
  assert.deepEqual(f.counters,{purchases:1,queries:0,deliveries:0,state:'UNCERTAIN'});
});
