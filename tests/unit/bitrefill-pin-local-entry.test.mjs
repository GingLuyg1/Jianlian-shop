import assert from 'node:assert/strict';
import test from 'node:test';
import {authorizePinLocalOrPurchase} from '../../lib/providers/bitrefill/pin-local-entry.mjs';
import {GIFFGAFF_PIN_SKUS} from '../../lib/providers/bitrefill/pin-order-entry.mjs';
const input={userId:'owner',productId:'product',skuId:GIFFGAFF_PIN_SKUS[0],quantity:1,clientRequestId:'request'};
function fixture({count=1,error=null,replay=null,metadata={}}={}) {
 const calls=[];let purchases=0;
 const service={from(table){calls.push(table);const q={select(){return q},eq(){return q},or(value){assert.match(value,/expires_at/);return q},
 maybeSingle:async()=>({data:table==='orders'?replay:{id:input.skuId,product_id:input.productId,metadata},error:null}),
 then(resolve,reject){return Promise.resolve({count,error}).then(resolve,reject)}};return q}};
 return {calls,purchases:()=>purchases,run:(overrides={})=>authorizePinLocalOrPurchase({input:{...input,...overrides},service,authorizePurchase:async()=>{purchases++;throw Error('SALE_CLOSED')},now:new Date('2026-11-04T00:00:00Z')})};
}
test('one real local PIN uses existing local order flow without enabling procurement',async()=>{
 const f=fixture();assert.deepEqual(await f.run(),{applicable:true,localInventoryOnly:true,replay:false});assert.equal(f.purchases(),0);assert.deepEqual(f.calls,['orders','product_skus','digital_inventory']);
});
test('absent or expired local stock remains subject to original closed procurement gate',async()=>{
 const f=fixture({count:0});await assert.rejects(f.run(),/SALE_CLOSED/);assert.equal(f.purchases(),1);
});
test('inventory read failure fails closed and never attempts a purchase',async()=>{
 const f=fixture({error:Error('private')});await assert.rejects(f.run(),/STOCK_READ_FAILED/);assert.equal(f.purchases(),0);
});
test('local retry remains idempotent after stock consumed; mismatched quantity or SKU rejected',async()=>{
 const replay={id:'order',order_items:[{product_id:input.productId,sku_id:input.skuId,quantity:1,product_snapshot:{supplier_binding:null}}]};
 const f=fixture({replay,count:0});assert.equal((await f.run()).replay,true);assert.deepEqual(f.calls,['orders']);assert.equal(f.purchases(),0);
 const bad=fixture({replay:{...replay,order_items:[{...replay.order_items[0],sku_id:'other'}]}});
 await assert.rejects(bad.run(),/REQUEST_CONFLICT/);
});
test('Daju remains untouched and explicit supplier paths cannot become local by a customer flag',async()=>{
 const f=fixture();assert.deepEqual(await f.run({skuId:'daju-sku'}),{applicable:false});assert.deepEqual(f.calls,[]);
 const supplier=fixture({metadata:{fulfillment_source:'supplier',supplier:'daju'}});await assert.rejects(supplier.run({localInventoryOnly:true}),/SALE_CLOSED/);
});
test('request cannot raise quantity or provide malformed identity',async()=>{
 for(const quantity of [0,2,-1,1.2]) await assert.rejects(fixture().run({quantity}),/INVALID/);
 await assert.rejects(fixture().run({clientRequestId:''}),/INVALID/);
});
