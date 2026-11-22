import test from 'node:test';
import assert from 'node:assert/strict';
import {createKuajingZyPurchaseStore} from '../../lib/providers/kuajingzy/purchase-store.mjs';
import {syntheticCandidate,ITEM,SKU,SYNTHETIC_SECRET} from '../fixtures/kuajingzy-mall-synthetic.mjs';
test('existing RPC contract receives only frozen claims, CAS and safe evidence',async()=>{
 const calls=[],service={rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true},error:null};}};
 const db=createKuajingZyPurchaseStore(service),candidate=syntheticCandidate();
 await db.claim('jianlian:order:item','a'.repeat(64),[]);
 await db.transition('attempt','CLAIMED','SUBMITTING');
 await db.evidence('attempt','DELIVERED','KUAJINGZY_AUTHORITATIVE_DELIVERED','b'.repeat(64));
 assert.deepEqual(calls.map(x=>x.name),['internal_supplier_purchase_claim','internal_supplier_purchase_transition','internal_supplier_purchase_record_evidence']);
 assert.equal(calls[0].args.p_supplier,'kuajingzy');
 assert.equal(calls[1].args.p_expected_status,'CLAIMED');assert.equal(calls[1].args.p_next_status,'SUBMITTING');
 assert.match(calls[2].args.p_result_class,/^[A-Z][A-Z0-9_]{0,99}$/);
 assert(!JSON.stringify(calls).includes(SYNTHETIC_SECRET));
});
test('historical pre-attempt root fails closed; marked exact root resumes',async()=>{
 const c=syntheticCandidate(),key='jianlian:'+c.orderId+':'+c.orderItemId;
 const root={id:'root',request_id:key,status:'PURCHASING',attempt_token:'token',order_id:c.orderId,
 order_item_id:c.orderItemId,supplier_product_id:ITEM,supplier_sku:SKU,provider_order_code:null,trigger_source:'old'};
 const service={rpc:async()=>({data:{action:'NONE',status:'PURCHASING'}}),from(){
 const b={select(){return b;},eq(){return b;},single:async()=>({data:root,error:null})};return b;}};
 const db=createKuajingZyPurchaseStore(service);
 await assert.rejects(db.root(c,key),/MANUAL_REVIEW/);
 root.trigger_source='kuajingzy_v1:test';assert.equal((await db.root(c,key)).attempt_token,'token');
 root.provider_order_code='already_created';await assert.rejects(db.root(c,key),/MANUAL_REVIEW/);
});


function balanceFinancialFixture({paymentMethod='balance',evidencePatch={}}={}) {
 const c=syntheticCandidate(),now=Date.parse('2026-11-18T00:00:00.000Z'),seen=[],verifiedCalls=[];
 const binding={fulfillment_source:'supplier',supplier:'kuajingzy',
  website_product_id:c.binding.websiteProductId,website_sku_id:c.binding.websiteSkuId,
  supplier_product_id:c.binding.productId,supplier_sku:c.binding.sku,supplier_currency:'CNY',
  supplier_max_unit_cost:c.binding.maxUnitCost,supplier_min_unit_profit:c.binding.minUnitProfit,
  supplier_min_margin_bps:c.binding.minMarginBps,supplier_auto_purchase_enabled:c.binding.enabled};
 const order={id:c.orderId,user_id:'persisted-test-user',payment_status:'paid',payment_method:paymentMethod,status:'paid',currency:'CNY',total_amount:'1.000000'};
 const item={id:c.orderItemId,order_id:c.orderId,product_id:c.binding.websiteProductId,sku_id:c.binding.websiteSkuId,
  quantity:1,line_total:'1.000000',delivery_type:'automatic',delivery_status:'pending',
  product_snapshot:{supplier_binding:binding}};
 const service={from(table){seen.push(table);const b={
  select(){return b;},eq(){return b;},order(){return b;},single(){return b;},
  then(resolve){return Promise.resolve({data:table==='orders'?order:[item],error:null}).then(resolve);}
 };return b;}};
 const verifiedCosts=async orderId=>{verifiedCalls.push(orderId);return {
  source:'verified_payment_costs',orderId,settlementKind:'balance_ledger',
  settlementId:'00000000-0000-4000-8000-000000000099',transactionNo:'BT_SYNTHETIC',
  provider:'internal_balance',currency:'CNY',paymentFee:'0.000000',otherFees:'0.000000',
  costScope:'order_settlement_only',checkedAt:new Date(now).toISOString(),...evidencePatch};};
 return {c,service,seen,verifiedCalls,verifiedCosts,clock:()=>now};
}

test('paid balance candidate consumes balance-ledger merchant cost evidence without payment_sessions',async()=>{
 const f=balanceFinancialFixture();
 const db=createKuajingZyPurchaseStore(f.service,{verifiedCosts:f.verifiedCosts,clock:f.clock});
 const rows=await db.loadCandidates(f.c.orderId);
 assert.equal(rows.length,1);
 assert.equal(rows[0].orderUserId,'persisted-test-user');
 assert.equal(rows[0].paymentMethod,'balance');
 assert.equal(rows[0].financials.paymentFee,'0.000000');
 assert.equal(rows[0].financials.otherFees,'0.000000');
 assert.deepEqual(f.verifiedCalls,[f.c.orderId]);
 assert(!f.seen.includes('payment_sessions'));
});

test('unsupported payment method and malformed balance-ledger evidence fail closed',async()=>{
 const external=balanceFinancialFixture({paymentMethod:'alipay'});
 await assert.rejects(
  createKuajingZyPurchaseStore(external.service,{verifiedCosts:external.verifiedCosts,clock:external.clock}).loadCandidates(external.c.orderId),
  /VERIFIED_PAYMENT_METHOD_UNSUPPORTED/
 );
 assert.equal(external.verifiedCalls.length,0);
 for(const evidencePatch of [
  {settlementKind:'payment_session'},
  {provider:'external'},
  {costScope:'funding_and_settlement'},
  {paymentFee:'0.010000'},
  {otherFees:'0.010000'},
  {checkedAt:'2000-01-01T00:00:00.000Z'}
 ]) {
  const f=balanceFinancialFixture({evidencePatch});
  await assert.rejects(
   createKuajingZyPurchaseStore(f.service,{verifiedCosts:f.verifiedCosts,clock:f.clock}).loadCandidates(f.c.orderId),
   /VERIFIED_PAYMENT_COST_EVIDENCE_REQUIRED/
  );
 }
});
