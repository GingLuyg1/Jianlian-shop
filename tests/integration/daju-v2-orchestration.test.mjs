import test from "node:test";
import assert from "node:assert/strict";
import { purchaseDajuV2, frozenUnits, reconcileDajuAttempt, money } from "../../lib/providers/daju/purchase-v2.mjs";
import { createDajuV2Store } from "../../lib/providers/daju/purchase-v2-store.mjs";

function fixture(options={}) {
  const candidate={orderId:"order-one",orderItemId:"item-one",quantity:1,binding:{productId:10,sku:null,maxUnitCost:"5.00",inputsMapping:{}},orderFields:{}};
  const env={SUPPLIER_AUTO_PURCHASE_ENABLED:"true",DAJU_AUTO_PURCHASE_MODE:"canary",DAJU_AUTO_PURCHASE_CANARY_ORDER_ID:"order-one",DAJU_AUTO_PURCHASE_MAX_ORDER_CNY:"5.00",...options.env};
  const events=[], evidence=[];let attempt=null,units=[],posts=0,gets=0,deliveries=0;
  const db={
    orderCost:async()=>options.aggregateCap?money("10"):money(candidate.binding.maxUnitCost)*BigInt(candidate.quantity),
    find:async()=>attempt,items:async()=>units,get:async()=>attempt,
    root:async()=>({id:"root-one",request_id:"jianlian:order-one:item-one",attempt_token:"token",status:"PURCHASING"}),
    claim:async(key,semantic,items)=>{if(options.claimError)throw Error("SEMANTIC_CONFLICT");events.push("claim");units=items;attempt={id:"attempt",supplier:"daju",logical_request_key:key,status:"CLAIMED",semantic_request_hash:semantic};return {result:options.claimResult??"CLAIMED",attempt_id:"attempt"};},
    transition:async(id,from,to,invoice)=>{if(options.submitConflict&&to==="SUBMITTING")return {result:"STATE_CONFLICT"};assert.equal(attempt.status,from);events.push(to);if(options.persistError&&to==="EXTERNAL_CREATED")throw Error("PERSIST_UNCERTAIN");attempt.status=to;attempt.external_invoice_id=invoice;return {result:"TRANSITIONED",status:to};},
    evidence:async(id,status,result,fingerprint)=>{events.push("evidence");evidence.push({id,status,result,fingerprint});},
    deliver:async()=>{events.push("deliver");if(attempt.status!=="SUCCEEDED")deliveries++;attempt.status="SUCCEEDED";},
  };
  const client={
    getProduct:async()=>{gets++;return {id:options.identityDrift&&gets===2?99:10,isAuto:true,stock:100,minQty:1,maxQty:20,isSku:false,skuVariants:[],price:options.overCost?"6.00":options.priceDrift&&gets===2?"4.50":"4.00",requiredInputs:[]};},
    getBalance:async()=>{if(options.balanceError)throw Error("BALANCE_ERROR");return {balance:options.lowBalance?"1.00":"100.00"};},
    purchase:async()=>{assert.equal(attempt.status,"SUBMITTING");posts++;events.push("post");if(options.timeout)throw Error("POST_ACCEPTED_TIMEOUT");return {orderCode:"order-code"};},
    getOrder:async()=>({orderCode:"order-code",requestId:"jianlian:order-one:item-one",productId:10,sku:null,quantity:1,unitPrice:"4.00",totalPrice:"4.00",status:"delivered",delivered:["PRIVATE_SENTINEL"]}),
  };
  return {candidate,env,client,db,events,evidence,run:()=>purchaseDajuV2({candidate,env,client,db}),posts:()=>posts,attempt:()=>attempt,deliveries:()=>deliveries};
}
for(const value of [undefined,"","false","TRUE","invalid"]) test(`master ${value} never dispatches POST`,async()=>{const f=fixture({env:{SUPPLIER_AUTO_PURCHASE_ENABLED:value}});await assert.rejects(f.run());assert.equal(f.posts(),0);});
for(const [name,options] of Object.entries({disabled:{env:{DAJU_AUTO_PURCHASE_MODE:"disabled"}},wrongOrder:{env:{DAJU_AUTO_PURCHASE_CANARY_ORDER_ID:"other"}},cap:{env:{DAJU_AUTO_PURCHASE_MAX_ORDER_CNY:"1"}},capAbsent:{env:{DAJU_AUTO_PURCHASE_MAX_ORDER_CNY:undefined}},balance:{lowBalance:true},balanceError:{balanceError:true},identity:{identityDrift:true},maxCost:{overCost:true},priceDrift:{priceDrift:true},semantic:{claimError:true}})) test(`${name} fails closed before POST`,async()=>{const f=fixture(options);await assert.rejects(f.run());assert.equal(f.posts(),0);});
test("claim not acquired and submitting conflict do not POST",async()=>{for(const options of [{claimResult:"ALREADY_CLAIMED"},{claimResult:"FAILED"},{submitConflict:true}]){const f=fixture(options);await f.run().catch(()=>{});assert.equal(f.posts(),0);}});
test("durable submission precedes one POST, external ID precedes GET delivery",async()=>{const f=fixture();await f.run();assert.equal(f.posts(),1);assert.equal(f.attempt().external_invoice_id,"order-code");assert.deepEqual(f.events,["claim","SUBMITTING","post","EXTERNAL_CREATED","evidence","deliver"]);await f.run();assert.equal(f.posts(),1);assert.equal(f.deliveries(),1);assert.doesNotMatch(JSON.stringify(f.evidence),/PRIVATE_SENTINEL/);});
test("timeout after provider acceptance becomes UNCERTAIN; replay never POSTs",async()=>{const f=fixture({timeout:true});await f.run();assert.equal(f.attempt().status,"UNCERTAIN");await f.run();assert.equal(f.posts(),1);});
test("external ID commit uncertainty is not retried",async()=>{const f=fixture({persistError:true});await assert.rejects(f.run());await f.run();assert.equal(f.posts(),1);assert.equal(f.attempt().status,"SUBMITTING");});
test("EXTERNAL_CREATED recovery only GETs, records evidence then private delivery",async()=>{const f=fixture();await f.run();f.attempt().status="EXTERNAL_CREATED";const count=f.posts();await reconcileDajuAttempt({db:f.db,client:{getOrder:f.client.getOrder},attempt:f.attempt()});assert.equal(f.posts(),count);assert.equal(f.evidence.at(-1).status,"DELIVERED");});
test("unit allocation never mixes order items; mixed durable allocation rejected",async()=>{const f=fixture();f.candidate.quantity=2;const u=frozenUnits(f.candidate,"root","4.00");assert.deepEqual(u.map(x=>x.unit_index),[1,2]);assert.equal(new Set(u.map(x=>x.order_item_id)).size,1);await assert.rejects(reconcileDajuAttempt({db:{items:async()=>[{...u[0]},{...u[1],order_item_id:"other"}]},client:{},attempt:{id:"x",status:"EXTERNAL_CREATED",external_invoice_id:"id"}}),/MIXED/);});
test("default production-like configuration never POSTs",async()=>{const f=fixture();await assert.rejects(purchaseDajuV2({db:f.db,client:f.client,candidate:f.candidate,env:{}}));assert.equal(f.posts(),0);});
test("whole-order cap includes other frozen Daju item costs",async()=>{const f=fixture({aggregateCap:true});await assert.rejects(f.run(),/ORDER_CAP/);assert.equal(f.posts(),0);});
test("canary order cannot fan out into two Daju item purchases",async()=>{
  const item={quantity:1,product_snapshot:{supplier_binding:{fulfillment_source:"supplier",supplier:"daju",supplier_product_id:10,supplier_max_unit_cost:"1"}}};
  const service={from(){const b={select(){return b},eq:async()=>({data:[item,item],error:null})};return b;}};
  await assert.rejects(createDajuV2Store(service).orderCost("order"),/CANARY_SINGLE_ITEM/);
});
test("frozen semantic drift on a paid-order replay fails closed",async()=>{const f=fixture();await f.run();f.candidate.binding.maxUnitCost="6.00";await assert.rejects(f.run(),/SEMANTIC_DRIFT/);assert.equal(f.posts(),1);});
test("semantic replay survives PostgreSQL numeric JSON representation",async()=>{
  const f=fixture();await f.run();const items=f.db.items;
  f.db.items=async()=> (await items()).map(x=>({...x,quoted_unit_cost:Number(x.quoted_unit_cost),max_unit_cost:Number(x.max_unit_cost)}));
  await f.run();assert.equal(f.posts(),1);assert.equal(f.deliveries(),1);
});
test("duplicate concurrent GET reconciliation delivers once without new POST",async()=>{
  const f=fixture({timeout:true});await f.run();Object.assign(f.attempt(),{status:"EXTERNAL_CREATED",external_invoice_id:"order-code"});
  await Promise.all([1,2].map(()=>reconcileDajuAttempt({db:f.db,client:{getOrder:f.client.getOrder},attempt:f.attempt()})));
  assert.equal(f.posts(),1);assert.equal(f.deliveries(),1);
});
test("recovery rejects mismatched identity/cost and absent private delivery",async()=>{
  for(const patch of [{productId:99},{unitPrice:"9.00"},{sku:"other"},{requestId:"other"},{delivered:[]}]){
    const f=fixture({timeout:true});await f.run();Object.assign(f.attempt(),{status:"EXTERNAL_CREATED",external_invoice_id:"order-code"});
    await reconcileDajuAttempt({db:f.db,client:{getOrder:async()=>({...await f.client.getOrder(),...patch})},attempt:f.attempt()});
    assert.equal(f.deliveries(),0);assert.equal(f.evidence.at(-1).status,"UNKNOWN");
  }
});
