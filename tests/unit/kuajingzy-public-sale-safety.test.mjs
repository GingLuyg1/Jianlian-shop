import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluateSkuActivationReadiness,getSupplierStockEvidence} from '../../lib/products/sku-activation-readiness.mjs';
import {parseKuajingZyStockPolicy} from '../../lib/providers/core/supplier-stock-readiness.mjs';
import {getKuajingZyPurchaseGateState} from '../../lib/providers/kuajingzy/purchase-policy.mjs';
import {authorizeKuajingZyStorefrontOrderCore as authorize} from '../../lib/providers/kuajingzy/storefront-core.mjs';
import {readProductActivationReadiness} from '../../lib/products/product-activation-readiness.mjs';
const metadata=()=>({fulfillment_source:'supplier',supplier:'kuajingzy',supplier_product_id:'item9',supplier_sku:'9',supplier_currency:'CNY',supplier_max_unit_cost:'0.15',supplier_min_unit_profit:'0.50',supplier_min_margin_bps:3000,supplier_auto_purchase_enabled:false,supplier_stock_snapshot:58027,supplier_stock_stale:false,supplier_stock_sync_status:'synced',supplier_stock_last_success_at:new Date().toISOString()});
const env={SUPPLIER_AUTO_PURCHASE_ENABLED:'true',KUAJINGZY_REAL_PURCHASE_ENABLED:'true',KUAJINGZY_MAX_ORDER_COST_CNY:'1'};
const product=()=>({id:'product',has_skus:false,status:'active',delivery_type:'automatic',metadata:metadata()});
const sku=()=>({id:'sku',product_id:'product',status:'active',stock:5,delivery_type:'automatic',metadata:metadata()});
const ctx={releaseGate:true,env};
const evaluate=(s)=>evaluateSkuActivationReadiness({product:product(),sku:s,purchaseContext:ctx});
test('complete disabled binding is distinct from malformed binding',()=>{const m=metadata();assert.ok(parseKuajingZyStockPolicy(m));assert.equal(getSupplierStockEvidence(m).binding_complete,true);const r=evaluate(sku());assert.ok(r.reasons.includes('SUPPLIER_PURCHASE_DISABLED'));assert.ok(!r.reasons.includes('SUPPLIER_BINDING_INCOMPLETE'));});
for(const [k,v] of Object.entries({supplier_product_id:'bad space',supplier_sku:9,supplier_currency:'USD',supplier_max_unit_cost:'0',supplier_min_unit_profit:'-1',supplier_min_margin_bps:10000,supplier_auto_purchase_enabled:'true'}))test('malformed '+k,()=>assert.equal(parseKuajingZyStockPolicy({...metadata(),[k]:v}),null));
for(const [name,change,reason] of [
 ['zero cap',s=>s.stock=0,'SELLABLE_CAP_REQUIRED'],['cap exceeds evidence',s=>s.stock=58028,'SELLABLE_CAP_EXCEEDS_SUPPLIER_SNAPSHOT'],
 ['stale',s=>s.metadata.supplier_stock_stale=true,'SUPPLIER_STOCK_UNVERIFIED'],['unknown',s=>delete s.metadata.supplier_stock_snapshot,'SUPPLIER_STOCK_UNVERIFIED'],
 ['zero upstream',s=>s.metadata.supplier_stock_snapshot=0,'SUPPLIER_STOCK_UNVERIFIED'],['old timestamp',s=>s.metadata.supplier_stock_last_success_at='2020-01-01T00:00:00Z','SUPPLIER_STOCK_UNVERIFIED']
])test('MODEL_C '+name,()=>{const s=sku();change(s);assert.ok(evaluate(s).reasons.includes(reason));});
test('cap five with upstream 58027 passes inventory without mirroring',()=>{const s=sku();s.metadata.supplier_auto_purchase_enabled=true;assert.equal(evaluate(s).ready,true);assert.equal(s.stock,5);});
for(const [name,input] of [ ['release',{releaseGate:false,env,binding:{enabled:true}}],['global',{releaseGate:true,env:{...env,SUPPLIER_AUTO_PURCHASE_ENABLED:'false'},binding:{enabled:true}}],['provider',{releaseGate:true,env:{...env,KUAJINGZY_REAL_PURCHASE_ENABLED:'false'},binding:{enabled:true}}],['binding',{releaseGate:true,env,binding:{enabled:false}}],['cap',{releaseGate:true,env:{...env,KUAJINGZY_MAX_ORDER_COST_CNY:undefined},binding:{enabled:true}}]])test('purchase gate '+name,()=>assert.equal(getKuajingZyPurchaseGateState(input).ready,false));
function orderCase({change=()=>{},releaseGate=true,freshChange=()=>{}}={}){
 const p=product(),s=sku();p.metadata.supplier_auto_purchase_enabled=s.metadata.supplier_auto_purchase_enabled=true;
 let reads=0,rpcs=0;const input={productId:'product',skuId:'sku',quantity:1,env,releaseGate,loadProduct:async()=>p,loadSku:async()=>s,readFresh:async()=>{reads++;const fresh={item:{id:'item9',variants:[{id:'9',stock:50,minimum:1,maximum:20,unitPrice:'0.09',prices:{CNY:'0.09'}}]},pricing:{currency:'CNY',memberDiscount:'1'}};freshChange(fresh);return fresh;}};
 change({p,s,input});return {input,counts:()=>({reads,rpcs}),invoke:async()=>{await authorize(input);rpcs++;}};
}
for(const [name,change] of [['draft',({s})=>s.status='draft'],['inactive',({s})=>s.status='inactive'],['zero',({s})=>s.stock=0],['quantity',({input})=>input.quantity=6],['missing SKU',({input})=>input.skuId=null],['wrong SKU',({input})=>input.skuId='wrong']])test('order rejects '+name,async()=>{const c=orderCase({change});await assert.rejects(c.invoke,/KUAJINGZY_ORDER_UNAVAILABLE/);assert.deepEqual(c.counts(),{reads:0,rpcs:0});});
test('literal release default blocks before fetch and RPC',async()=>{const c=orderCase({releaseGate:false});await assert.rejects(c.invoke);assert.deepEqual(c.counts(),{reads:0,rpcs:0});});
test('only injected future gates allow a fresh read, never a purchase',async()=>{const c=orderCase();await c.invoke();assert.deepEqual(c.counts(),{reads:1,rpcs:1});});
for(const [name,change] of [['out of stock',x=>x.item.variants[0].stock=0],['price drift',x=>{x.item.variants[0].unitPrice='0.20';x.item.variants[0].prices.CNY='0.20';}],['identity',x=>x.item.id='other']])test('fresh failure prevents order RPC '+name,async()=>{const c=orderCase({freshChange:change});await assert.rejects(c.invoke);assert.deepEqual(c.counts(),{reads:1,rpcs:0});});
test('ordinary providers remain outside KuajingZY interlock',async()=>{for(const supplier of ['daju','bitrefill',undefined]){const c=orderCase({change:({p,s})=>{p.metadata={supplier};s.metadata={supplier};}});assert.deepEqual(await authorize(c.input),{applicable:false});assert.equal(c.counts().reads,0);}});
function service(rows){return {from:table=>({select:()=>({eq:()=>table==='product_skus'?Promise.resolve({data:rows}):({eq:()=>({eq:()=>({eq:()=>Promise.resolve({count:0})})})})})})};}
test('product actual rows override stale has_skus false',async()=>{assert.equal((await readProductActivationReadiness(service([{...sku(),status:'draft'}]),product())).ready,false);});
test('product active automatic supplier must pass disabled purchase readiness',async()=>{const r=await readProductActivationReadiness(service([sku()]),product());assert.equal(r.ready,false);assert.ok(r.reasons.includes('SUPPLIER_PURCHASE_DISABLED'));});
test('product without any SKU keeps ordinary product behavior',async()=>assert.equal((await readProductActivationReadiness(service([]),product())).ready,true));
test('HTTP routes wire guards before persistence and require all existing SKU rows',()=>{
 const order=fs.readFileSync('app/api/orders/route.ts','utf8');assert.ok(order.indexOf('await authorizeKuajingZyStorefrontOrder')<order.indexOf('await supabase.rpc("create_order_with_item"'));
 assert.match(order,/\.select\("id", \{ count: "exact", head: true \}\)\s*\.eq\("product_id", productId\);/);
 const status=fs.readFileSync('app/api/admin/products/[id]/status/route.ts','utf8');assert.match(status,/readProductActivationReadiness/);assert.match(status,/PRODUCT_ACTIVATION_NOT_READY/);
});
