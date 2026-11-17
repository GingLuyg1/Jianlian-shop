import test from 'node:test';
import assert from 'node:assert/strict';
import {createKuajingZyPurchaseClient,KUAJINGZY_DURABLE_SUBMIT,commitKuajingZyPrivateDelivery,classifyKuajingZyOrder} from '../../lib/providers/kuajingzy/purchase-client.mjs';
import {freezeKuajingZyMallRequest,parseKuajingZyCny} from '../../lib/providers/kuajingzy/mall-order-contract.mjs';
import {syntheticOrder,ITEM,SKU,SYNTHETIC_SECRET,syntheticCandidate,syntheticEnvironment} from '../fixtures/kuajingzy-mall-synthetic.mjs';

const frozen=()=>freezeKuajingZyMallRequest({key:'jianlian:synthetic_order:synthetic_item',itemId:ITEM,skuId:SKU,quantity:1,expectedAmount:'0.090'});
const expected={itemId:ITEM,skuId:SKU,quantity:1,expectedAmount:'0.090'};
const make=(fetchImpl,options={})=>{
  const c=createKuajingZyPurchaseClient({apiKey:'SYNTHETIC_ONLY_API_KEY',fetchImpl,environment:syntheticEnvironment(),releaseGate:true,...options});
  return {...c,purchase:(frozen,authority,binding=syntheticCandidate().binding)=>c.purchase(frozen,authority,binding)};
};

test('real documented POST and GET use exact frozen body; ordinary DTO has no raw delivery',async()=>{
  const calls=[],client=make(async(url,init)=>{
    calls.push({url,method:init.method,body:init.body,key:init.headers['Idempotency-Key']});
    assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');
    return Response.json(init.method==='POST'?{data:{order:syntheticOrder()}}:{data:syntheticOrder()});
  });
  const created=await client.purchase(frozen(),KUAJINGZY_DURABLE_SUBMIT);
  assert.equal(calls[0].url,'https://888.kuajing.one/api/open/v1/orders/mall');
  assert.equal(calls[0].body,frozen().body);assert.equal(calls[0].key,frozen().key);
  assert.equal(created.totalPrice,'0.0900');assert.equal(created.unitPrice,'0.0900');assert.equal(created.itemId,ITEM);assert.equal(created.skuId,SKU);
  assert.equal(created.quantity,1);assert.equal(created.refundStatus,'none');assert.equal(created.currency,'CNY');
  assert(!JSON.stringify(created).includes(SYNTHETIC_SECRET));
  await assert.rejects(commitKuajingZyPrivateDelivery(created,()=>{}),/PRIVATE_DELIVERY_NOT_VERIFIED/);
  const queried=await client.getOrder(created.orderCode,expected);
  assert.equal(calls[1].url,'https://888.kuajing.one/api/open/v1/orders/synthetic_order_1');
  assert.equal(calls[1].method,'GET');assert(!calls[1].body);
  assert(!JSON.stringify(queried).includes(SYNTHETIC_SECRET));
  let commits=0;
  await commitKuajingZyPrivateDelivery(queried,content=>{assert.equal(content,SYNTHETIC_SECRET);commits++;});
  await assert.rejects(commitKuajingZyPrivateDelivery(queried,()=>{}),/PRIVATE_DELIVERY_NOT_VERIFIED/);
  assert.equal(commits,1);
});
test('decimal representations 0.09/0.090/0.0900 compare exactly',()=>{
  assert.equal(parseKuajingZyCny('0.09'),parseKuajingZyCny('0.090'));
  assert.equal(parseKuajingZyCny('0.09'),parseKuajingZyCny('0.0900'));
});
for(const [status,code,classification] of [
  [409,'PRICE_CHANGED','NO_DEBIT_PRICE_CHANGED'],[402,'INSUFFICIENT_BALANCE','NO_DEBIT_INSUFFICIENT_BALANCE'],
  [409,'IDEMPOTENCY_CONFLICT','IDEMPOTENCY_CONFLICT'],[422,'INVALID_REQUEST','DEBIT_UNCONFIRMED'],
  [422,'OUT_OF_STOCK','DEBIT_UNCONFIRMED'],[500,'INTERNAL_ERROR','DEBIT_UNCONFIRMED'],
])test('safe classification '+code,async()=>{
  let calls=0;const c=make(async()=>{calls++;return Response.json({error:{code,message:SYNTHETIC_SECRET}},{status});});
  await assert.rejects(c.purchase(frozen(),KUAJINGZY_DURABLE_SUBMIT),e=>{
    assert.equal(e.classification,classification);assert(!String(e).includes(SYNTHETIC_SECRET));assert(!JSON.stringify(e).includes(SYNTHETIC_SECRET));return true;
  });
  await assert.rejects(c.purchase(frozen(),KUAJINGZY_DURABLE_SUBMIT),/POST_ALREADY_ATTEMPTED/);assert.equal(calls,1);
});
test('timeout, connection reset, response loss and invalid JSON never retry or reveal secrets',async()=>{
  for(const fetchImpl of [
    async()=>{throw Error(SYNTHETIC_SECRET+' reset');},
    async()=>new Response(SYNTHETIC_SECRET,{headers:{'content-type':'application/json'}}),
    async()=>new Response(new ReadableStream({start(c){c.error(Error(SYNTHETIC_SECRET));}}),{headers:{'content-type':'application/json'}}),
  ]) {
    let calls=0;const c=make((...a)=>{calls++;return fetchImpl(...a);});
    await assert.rejects(c.purchase(frozen(),KUAJINGZY_DURABLE_SUBMIT),e=>e.classification==='DEBIT_UNCONFIRMED'&&!String(e).includes(SYNTHETIC_SECRET));
    await assert.rejects(c.purchase(frozen(),KUAJINGZY_DURABLE_SUBMIT),/POST_ALREADY_ATTEMPTED/);assert.equal(calls,1);
  }
});
test('bounded timeout interrupts native-style abortable transport',async()=>{
  const c=make((_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error(SYNTHETIC_SECRET)),{once:true})),{timeoutMs:10});
  await assert.rejects(c.purchase(frozen(),KUAJINGZY_DURABLE_SUBMIT),e=>e.classification==='DEBIT_UNCONFIRMED');
});
test('oversize response, invalid identity, raw HTML and duplicate card lines never enter private commit',async()=>{
  for(const patch of [{delivery:'x'.repeat(262145)},{itemId:'wrong'},{deliveryFormat:'html',delivery:'<p>'+SYNTHETIC_SECRET+'</p>'},
    {quantity:2,delivery:SYNTHETIC_SECRET+'\n'+SYNTHETIC_SECRET}]) {
    const c=make(async()=>Response.json({data:syntheticOrder(patch)}));
    let dto;try{dto=await c.getOrder('synthetic_order_1',expected);}catch(e){assert(!String(e).includes(SYNTHETIC_SECRET));continue;}
    await assert.rejects(commitKuajingZyPrivateDelivery(dto,()=>{}));
  }
});
test('runtime credential/debug and capability guards fail before fetch',async()=>{
  let calls=0;const f=async()=>{calls++;throw Error('FORBIDDEN');};
  for(const environment of [{NODE_DEBUG:'http'},{NODE_DEBUG_NATIVE:'tls'},{NEXT_PUBLIC_KUAJINGZY_API_KEY:'bad'}])assert.throws(()=>make(f,{environment}));
  const c=make(f);await assert.rejects(c.purchase(frozen()),/DURABLE_CAPABILITY_REQUIRED/);
  await assert.rejects(c.purchase({...frozen(),body:frozen().body.replace(ITEM,'WRONG')},KUAJINGZY_DURABLE_SUBMIT),/FROZEN_REQUEST_INVALID/);
  await assert.rejects(c.getOrder('../secret',expected));assert.equal(calls,0);
});
test('transport independently rechecks release, global, supplier and binding gates',async()=>{
  let calls=0;const f=async()=>{calls++;throw Error('FORBIDDEN');};
  for(const options of [{releaseGate:false},{environment:{}},{environment:{...syntheticEnvironment(),KUAJINGZY_REAL_PURCHASE_ENABLED:'false'}}]){
    const c=make(f,options);await assert.rejects(c.purchase(frozen(),KUAJINGZY_DURABLE_SUBMIT));
  }
  const c=make(f);await assert.rejects(c.purchase(frozen(),KUAJINGZY_DURABLE_SUBMIT,{...syntheticCandidate().binding,enabled:false}));
  assert.equal(calls,0);
});
test('status and refund normalization follows safe documented DTO',async()=>{
  for(const [patch,wanted] of [[{status:'paid',delivery:''},'ORDER_CREATED'],[{status:'processing',delivery:''},'ORDER_PROCESSING'],
    [{status:'completed'},'ORDER_COMPLETED'],[{status:'cancelled',delivery:''},'ORDER_CANCELLED'],
    [{status:'cancelled',delivery:'',refund:{status:'full',amount:0.09,currency:'CNY'}},'REFUNDED']]) {
    const c=make(async()=>Response.json({data:syntheticOrder(patch)}));
    const dto=await c.getOrder('synthetic_order_1',expected);assert.equal(classifyKuajingZyOrder(dto),wanted);
  }
});
