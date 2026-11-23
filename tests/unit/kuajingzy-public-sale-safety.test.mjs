import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluateSkuActivationReadiness,getSupplierStockEvidence} from '../../lib/products/sku-activation-readiness.mjs';
import {parseKuajingZyStockPolicy} from '../../lib/providers/core/supplier-stock-readiness.mjs';
import {getKuajingZyPurchaseGateState} from '../../lib/providers/kuajingzy/purchase-policy.mjs';
import {authorizeKuajingZyStorefrontOrderCore as authorize} from '../../lib/providers/kuajingzy/storefront-core.mjs';
import {readProductActivationReadiness} from '../../lib/products/product-activation-readiness.mjs';
import {loadTs} from '../helpers/payment-session-guard-harness.mjs';
import {CANARY_USER,CANARY_PRODUCT,CANARY_SKU,CANARY_ITEM,CANARY_VARIANT,
  syntheticCanaryEnvironment} from '../fixtures/kuajingzy-mall-synthetic.mjs';
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
 const p={...product(),id:CANARY_PRODUCT},s={...sku(),id:CANARY_SKU,product_id:CANARY_PRODUCT,stock:1};
 const binding={supplier_auto_purchase_enabled:true,supplier_product_id:CANARY_ITEM,supplier_sku:CANARY_VARIANT,supplier_max_unit_cost:'0.0990'};
 Object.assign(p.metadata,binding);Object.assign(s.metadata,binding);
 let reads=0,rpcs=0;const input={productId:CANARY_PRODUCT,skuId:CANARY_SKU,quantity:1,userId:CANARY_USER,paymentMethod:'balance',env:syntheticCanaryEnvironment(),releaseGate,loadProduct:async()=>p,loadSku:async()=>s,readFresh:async()=>{reads++;const fresh={item:{id:CANARY_ITEM,variants:[{id:CANARY_VARIANT,stock:50,minimum:1,maximum:20,unitPrice:'0.09',prices:{CNY:'0.09'}}]},pricing:{currency:'CNY',memberDiscount:'1'}};freshChange(fresh);return fresh;}};
 change({p,s,input});return {input,counts:()=>({reads,rpcs}),invoke:async()=>{await authorize(input);rpcs++;}};
}
for(const [name,change] of [['draft',({s})=>s.status='draft'],['inactive',({s})=>s.status='inactive'],['zero',({s})=>s.stock=0],['quantity',({input})=>input.quantity=6],['missing SKU',({input})=>input.skuId=null],['wrong SKU',({input})=>input.skuId='wrong']])test('order rejects '+name,async()=>{const c=orderCase({change});await assert.rejects(c.invoke,/KUAJINGZY_ORDER_UNAVAILABLE/);assert.deepEqual(c.counts(),{reads:0,rpcs:0});});
test('literal release default blocks before fetch and RPC',async()=>{const c=orderCase({releaseGate:false});await assert.rejects(c.invoke);assert.deepEqual(c.counts(),{reads:0,rpcs:0});});
test('authenticated Canary user may submit one balance order for the fixed SKU',async()=>{const c=orderCase();await c.invoke();assert.deepEqual(c.counts(),{reads:1,rpcs:1});});
for(const [name,change] of [
 ['wrong user',({input})=>input.userId='00000000-0000-4000-8000-000000000091'],
 ['another bound SKU',({s,input})=>input.skuId=s.id='other'],
 ['retired supplier SKU',({s})=>s.metadata.supplier_sku='16'],
 ['quantity two',({input})=>input.quantity=2],
 ['sellable cap above one',({s})=>s.stock=2],
 ['missing private env',({input})=>{
   delete input.env.KUAJINGZY_CANARY_USER_ID;
   input.env.NEXT_PUBLIC_KUAJINGZY_CANARY_USER_ID=CANARY_USER;
 }],
 ['order cap above ten fen',({input})=>input.env.KUAJINGZY_MAX_ORDER_COST_CNY='0.11'],
 ...['alipay','wechat_pay','usdt_bep20'].map(method=>[method,({input})=>input.paymentMethod=method]),
]) test('Canary storefront denies '+name+' before supplier GET or order RPC',async()=>{
 const c=orderCase({change});
 await assert.rejects(c.invoke,/KUAJINGZY_ORDER_UNAVAILABLE/);
 assert.deepEqual(c.counts(),{reads:0,rpcs:0});
});
for(const [name,change] of [['out of stock',x=>x.item.variants[0].stock=0],['price drift',x=>{x.item.variants[0].unitPrice='0.20';x.item.variants[0].prices.CNY='0.20';}],['identity',x=>x.item.id='other']])test('fresh failure prevents order RPC '+name,async()=>{const c=orderCase({freshChange:change});await assert.rejects(c.invoke);assert.deepEqual(c.counts(),{reads:1,rpcs:0});});
test('ordinary providers remain outside KuajingZY interlock',async()=>{for(const supplier of ['daju','bitrefill',undefined]){const c=orderCase({change:({p,s})=>{p.metadata={supplier};s.metadata={supplier};}});assert.deepEqual(await authorize(c.input),{applicable:false});assert.equal(c.counts().reads,0);}});
test('orders POST rejects body overrides and ignores spoofed headers and cookies',async()=>{
 const path='app/api/orders/route.ts', source=fs.readFileSync(path,'utf8');
 const c=orderCase();
 const wrongUser='00000000-0000-4000-8000-000000000091';
 let authorizationCalls=0, orderWrites=0, payments=0;
 const imports=Object.fromEntries(Array.from(source.matchAll(/from "([^"]+)"/g),([,name])=>[name,{}]));
 const supabase={auth:{getUser:async()=>({data:{user:{id:wrongUser,email:'shopper@example.com'}}})},
   rpc:async()=>{orderWrites++;throw new Error('UNEXPECTED_ORDER_WRITE');}};
 Object.assign(imports,{
   'next/server':{NextResponse:Response},
   '@/lib/supabase/server':{hasSupabaseServerConfig:()=>true,getSupabaseServerClient:()=>supabase},
   '@/lib/security/rate-limit':{checkRequestSize:()=>null,checkRateLimit:()=>({allowed:true}),getUserRateLimitKey:()=>''},
   '@/lib/users/account-guard':{assertUserBusinessAllowed:async()=>{}},
   '@/lib/payments/payment-methods':loadTs('lib/payments/payment-methods.ts',{}),
   '@/lib/catalog/order-product-visibility.mjs':{checkOrderProductAvailability:async()=>({available:true})},
   '@/lib/providers/kuajingzy/storefront':{authorizeKuajingZyStorefrontOrder:async(_service,productId,skuId,quantity,userId,paymentMethod)=>{
     authorizationCalls++;
     return authorize({...c.input,productId,skuId,quantity,userId,paymentMethod});
   }},
   '@/lib/orders/balance-payment-service':{payOrderWithBalance:async()=>{payments++;}},
 });
 const {POST}=loadTs(path,imports,source);
 const submit=overrides=>POST(new Request('https://test.invalid/api/orders?user_id='+CANARY_USER,{
   method:'POST',headers:{'x-user-id':CANARY_USER,cookie:'user_id='+CANARY_USER},
   body:JSON.stringify({product_id:CANARY_PRODUCT,sku_id:CANARY_SKU,quantity:1,payment_method:'balance',
     client_request_id:CANARY_USER,customer_email:'merchant@example.com',...overrides}),
 }));
 assert.equal((await submit({user_id:CANARY_USER})).status,400);
 assert.equal(authorizationCalls,0);
 const denied=await submit({});
 assert.equal(denied.status,409);
 assert.equal((await denied.json()).code,'KUAJINGZY_ORDER_UNAVAILABLE');
 assert.equal(authorizationCalls,1);
 assert.deepEqual(c.counts(),{reads:0,rpcs:0});
 assert.equal(orderWrites,0);
 assert.equal(payments,0);
});
function service(rows){return {from:table=>({select:()=>({eq:()=>table==='product_skus'?Promise.resolve({data:rows}):({eq:()=>({eq:()=>({eq:()=>Promise.resolve({count:0})})})})})})};}
test('product actual rows override stale has_skus false',async()=>{assert.equal((await readProductActivationReadiness(service([{...sku(),status:'draft'}]),product())).ready,false);});
test('product active automatic supplier must pass disabled purchase readiness',async()=>{const r=await readProductActivationReadiness(service([sku()]),product());assert.equal(r.ready,false);assert.ok(r.reasons.includes('SUPPLIER_PURCHASE_DISABLED'));});
test('product without any SKU keeps ordinary product behavior',async()=>assert.equal((await readProductActivationReadiness(service([]),product())).ready,true));
test('HTTP routes wire guards before persistence and require all existing SKU rows',()=>{
 const order=fs.readFileSync('app/api/orders/route.ts','utf8');assert.ok(order.indexOf('await authorizeKuajingZyStorefrontOrder')<order.indexOf('await supabase.rpc("create_order_with_item"'));
 assert.match(order,/await authorizeKuajingZyStorefrontOrder\(supabase, productId, skuId, quantity, user\.id, paymentMethod\)/);
 assert.match(order,/await supabase\.auth\.getUser\(\)/);
 assert.ok(order.indexOf('await authorizeKuajingZyStorefrontOrder')<order.indexOf('await payOrderWithBalance'));
 assert.doesNotMatch(order,/KUAJINGZY_CANARY_USER_ID|NEXT_PUBLIC_KUAJINGZY_CANARY_USER_ID/);
 const wrapper=fs.readFileSync('lib/providers/kuajingzy/storefront.ts','utf8');
 assert.match(wrapper,/import 'server-only'/);
 assert.match(wrapper,/env:process\.env,releaseGate:KUAJINGZY_PURCHASE_RELEASE_ENABLED/);
 assert.match(order,/\.select\("id", \{ count: "exact", head: true \}\)\s*\.eq\("product_id", productId\);/);
 const status=fs.readFileSync('app/api/admin/products/[id]/status/route.ts','utf8');assert.match(status,/readProductActivationReadiness/);assert.match(status,/PRODUCT_ACTIVATION_NOT_READY/);
});
