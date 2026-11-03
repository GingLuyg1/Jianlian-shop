import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createBitrefillPinOrderAuthorizer, createBitrefillPinOrderRuntime, GIFFGAFF_PIN_SKUS } from '../../lib/providers/bitrefill/pin-order-entry.mjs';
import { authorizeBitrefillPinOrder, getBitrefillPinHandler, installBitrefillPinRuntime } from '../../lib/providers/bitrefill/pin-runtime.mjs';
import { pinFixture, PinFakeTransport } from '../support/bitrefill-pin-fixture.mjs';
import { loadBitrefillSingleItemCandidate } from '../../lib/providers/bitrefill/single-item-purchase.mjs';
import { prepareBitrefillPinPurchase } from '../../lib/providers/bitrefill/pin-policy.mjs';

const request=()=>({userId:'synthetic-user',productId:'synthetic-product',skuId:GIFFGAFF_PIN_SKUS[0],quantity:1,clientRequestId:'synthetic-request'});
function factory({enabled=true,replay=false,evidence={source:'synthetic_pin_order_quote'},error=false}={}) {
  const calls=[];
  const authorize=createBitrefillPinOrderAuthorizer({transport:new PinFakeTransport(pinFixture()),loadEvidence:async()=>{calls.push('evidence');return evidence;},
    service:{rpc:async(name,args)=>{calls.push({name,args});return name.endsWith('entry_status')?{data:{enabled,replay,authorization:{}},error:null}:{data:{quote_id:'synthetic-ticket'},error:error?Error('PRIVATE_COST_NEVER_ECHO'):null};}}});
  return {authorize,calls};
}
test('non-target Daju order bypasses PIN dependencies without any DB read',async()=>{
  const f=factory();assert.deepEqual(await f.authorize({...request(),skuId:'daju-sku'}),{applicable:false});assert.equal(f.calls.length,0);
  assert.deepEqual(await authorizeBitrefillPinOrder({skuId:'daju-sku'}),{applicable:false});
});
test('compiled gate and missing runtime cannot be bypassed by order input',async()=>{
  await assert.rejects(authorizeBitrefillPinOrder({...request(),enabled:true}),/SALE_CLOSED/);
  assert.equal(getBitrefillPinHandler(),undefined);
  assert.throws(()=>installBitrefillPinRuntime({authorizeOrder:async()=>{},fulfillPaidOrder:async()=>{}}),/REAL_PURCHASE_DISABLED/);
});
test('shared server composition needs both entry evidence and original purchase dependencies',()=>{
  const transport=new PinFakeTransport(pinFixture());
  assert.throws(()=>createBitrefillPinOrderRuntime({transport,service:{rpc(){}},loadOrderEvidence:async()=>({})}),/BUDGET_RESERVER_REQUIRED/);
  const runtime=createBitrefillPinOrderRuntime({transport,service:{rpc(){}},loadOrderEvidence:async()=>({}),reserveBudget:async()=>({}),
    loadPricing:async()=>({}),loadFinancialEvidence:async()=>({}),loadSupplierBalance:async()=>({})});
  assert.equal(typeof runtime.authorizeOrder,'function');assert.equal(typeof runtime.fulfillPaidOrder,'function');assert.ok(Object.isFrozen(runtime));
  assert.equal(getBitrefillPinHandler(),undefined);
});
test('fresh quote uses server authenticated identity and never returns private cost',async()=>{
  const f=factory();const result=await f.authorize(request());assert.deepEqual(result,{applicable:true,replay:false});
  assert.equal(f.calls[0].args.p_user,'synthetic-user');assert.equal(f.calls[2].name,'internal_bitrefill_pin_authorize_quote');
});
test('replay does not fetch another quote, and closed sale cannot issue one',async()=>{
  const f=factory({replay:true,enabled:false});assert.equal((await f.authorize(request())).replay,true);assert.equal(f.calls.length,1);
  const closed=factory({enabled:false});await assert.rejects(closed.authorize(request()),/SALE_CLOSED/);assert.equal(closed.calls.length,1);
});
test('quantity/request limits, wrong source and quote failures stop before order',async()=>{
  const f=factory();await assert.rejects(f.authorize({...request(),quantity:2}),/REQUEST_INVALID/);assert.equal(f.calls.length,0);
  await assert.rejects(factory({evidence:{source:'authenticated_pin_order_quote'}}).authorize(request()),/SOURCE_INVALID/);
  await assert.rejects(factory({error:true}).authorize(request()),/^Error: BITREFILL_PIN_ENTRY_QUOTE_REJECTED$/);
});

// Execute the actual route with explicit auth/risk/catalog boundary mocks.
// No order/payment/notification is created: the DB mock returns a controlled
// missing-signature error, allowing us to test the pre-RPC lifecycle safely.
function route(authorize) {
  const calls=[];const user={id:'authenticated-user',email:'synthetic@example.invalid'};
  const client={auth:{getUser:async()=>({data:{user},error:null})},from:()=>({select:()=>({eq(){return this;},then:yes=>Promise.resolve({count:1,error:null}).then(yes)})}),
    rpc:async(name,args)=>{calls.push({name,args});return {data:null,error:{code:'PGRST202',message:'synthetic missing function'}};}};
  const mocks={NextResponse:{json:(body,options={})=>({body,status:options.status??200})},authorizeBitrefillPinOrder:authorize,ensureBitrefillProductionRuntime:()=>{},
    hasSupabaseServerConfig:()=>true,getSupabaseServerClient:()=>client,checkRequestSize:()=>null,checkRateLimit:()=>({allowed:true}),getUserRateLimitKey:()=>'',
    assertUserBusinessAllowed:async()=>{},normalizePaymentMethod:x=>x,isLiuhaoyiPaymentMethod:()=>false,checkOrderProductAvailability:async()=>({available:true}),
    verifyCheckoutAgreements:async()=>[],evaluateOrderRisk:async()=>({}),shouldBlockRisk:()=>false,getOrderErrorMessage:()=> 'synthetic error'};
  const src=readFileSync(new URL('../../app/api/orders/route.ts',import.meta.url),'utf8');
  const js=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const exports={};new Function('require','exports','console',js)(()=>mocks,exports,{error(){},warn(){},info(){}});
  return {post:body=>exports.POST({json:async()=>body}),calls};
}
const body=()=>({product_id:'synthetic-product',sku_id:GIFFGAFF_PIN_SKUS[0],quantity:1,client_request_id:'synthetic-request',payment_method:'balance'});
test('actual storefront rejects closed PIN before invoking order/payment RPC',async()=>{
  const r=route(authorizeBitrefillPinOrder),result=await r.post(body());assert.equal(result.status,503);assert.equal(r.calls.length,0);
  assert.equal(result.body.code,'BITREFILL_PIN_ORDER_UNAVAILABLE');
});
test('actual storefront passes auth user to quote hook and never falls back PIN signature',async()=>{
  const observed=[];const r=route(async x=>{observed.push(x);return {applicable:true};});await r.post(body());
  assert.equal(observed[0].userId,'authenticated-user');assert.equal(r.calls.length,1);assert.equal(r.calls[0].args.p_sku_id,GIFFGAFF_PIN_SKUS[0]);
});
test('actual storefront rejects customer injected financial/authorization evidence',async()=>{
  const r=route(async()=>{throw Error('MUST_NOT_RUN');});const result=await r.post({...body(),p_evidence:{allInUsd:'0',enabled:true}});
  assert.equal(result.status,400);assert.equal(r.calls.length,0);
});
test('actual storefront Daju payload and single RPC path remain unchanged',async()=>{
  const r=route(authorizeBitrefillPinOrder);await r.post({...body(),sku_id:'daju-sku'});assert.equal(r.calls.length,1);assert.equal(r.calls[0].args.p_sku_id,'daju-sku');
  assert.equal(r.calls[0].args.p_payment_method,'balance');assert.equal(r.calls[0].args.p_client_request_id,'synthetic-request');
});
test('private binding read rejects identity tampering and never mutates public snapshot',async()=>{
  const f=pinFixture(),publicBinding={...f.candidate.orderItem.product_snapshot.supplier_binding,pin_order_entry_version:2,pin_quote_id:'synthetic-quote',supplier_binding_version:1};
  delete publicBinding.supplier_max_unit_cost;delete publicBinding.supplier_min_unit_profit;
  const publicItem={...f.candidate.orderItem,product_snapshot:{supplier_binding:publicBinding}};
  const data={orders:f.candidate.order,order_items:publicItem,supplier_fulfillment_requests:f.candidate.root};let tamper=false;
  const service={from:table=>({select:()=>({eq:()=>({single:async()=>({data:data[table],error:null})})})}),rpc:async()=>({data:{...publicBinding,supplier_max_unit_cost:'15',supplier_min_unit_profit:'1',...(tamper?{supplier_sku:'wrong'}:{})},error:null})};
  const result=await loadBitrefillSingleItemCandidate(service,f.candidate.order.id,publicItem.id);
  assert.equal(result.orderItem.product_snapshot.supplier_binding.supplier_max_unit_cost,'15');assert.equal(publicBinding.supplier_max_unit_cost,undefined);
  tamper=true;await assert.rejects(loadBitrefillSingleItemCandidate(service,f.candidate.order.id,publicItem.id),/PRIVATE_BINDING_MISMATCH/);
});
test('V2 paid handler rechecks frozen account, authorization and cumulative cap',()=>{
  const f=pinFixture();Object.assign(f.candidate.orderItem.product_snapshot.supplier_binding,{pin_order_entry_version:2,
    pin_account_fingerprint:'a'.repeat(64),pin_authorization_reference:'SYNTHETIC_PIN_TEST_ONLY',pin_cumulative_cap_usd:'100'});
  const t=new PinFakeTransport(f);assert.ok(prepareBitrefillPinPurchase({transport:t,...f}));
  for(const change of [x=>x.pricing.quote.accountFingerprint='b'.repeat(64),x=>x.financial.authorizationReference='OTHER_SCOPE',x=>x.financial.cumulativeCapUsd='101']){
    const wrong=structuredClone(f);change(wrong);assert.throws(()=>prepareBitrefillPinPurchase({transport:t,...wrong}),/ORDER_AUTHORIZATION_DRIFT/);
  }
  assert.equal(t.invoiceSubmissions,0);
});
