import test from 'node:test';
import assert from 'node:assert/strict';
import {fulfillKuajingZyCandidate,reconcileKuajingZyAttempt,createKuajingZyFrozenUnits} from '../../lib/providers/kuajingzy/fulfillment-core.mjs';
import {createKuajingZyPurchaseClient} from '../../lib/providers/kuajingzy/purchase-client.mjs';
import {parseKuajingZyBinding,inspectKuajingZyProduct,KUAJINGZY_PURCHASE_RELEASE_ENABLED} from '../../lib/providers/kuajingzy/purchase-policy.mjs';
import {canSupplierAutoPurchase} from '../../lib/providers/core/supplier-router-core.mjs';
import {syntheticCandidate,syntheticEnvironment,syntheticProduct,syntheticOrder,SYNTHETIC_SECRET,ITEM,SKU} from '../fixtures/kuajingzy-mall-synthetic.mjs';

function fixture(options={}) {
  const candidate=syntheticCandidate(),env={...syntheticEnvironment(),...options.env};
  let attempt=null,units=[],posts=0,gets=0,deliveries=0,cas=0,quoteCalls=0,committed=false,crashed=false;
  const evidence=[],events=[];
  const db={
    find:async()=>attempt?structuredClone(attempt):null,
    get:async()=>structuredClone(attempt),items:async()=>structuredClone(units),orderCost:async()=>options.overOrder?999999n:1000n,
    root:async()=>({id:'00000000-0000-4000-8000-000000000010',status:'PURCHASING',request_id:'root',attempt_token:'root-token'}),
    async claim(key,semantic,items){
      if(!attempt){units=structuredClone(items);attempt={id:'00000000-0000-4000-8000-000000000011',supplier:'kuajingzy',logical_request_key:key,semantic_request_hash:semantic,status:'CLAIMED',external_invoice_id:null};events.push('CLAIMED');}
      assert.equal(attempt.semantic_request_hash,semantic);
      return {result:'ALREADY_CLAIMED',attempt_id:attempt.id};
    },
    async transition(_id,from,to,invoice){
      if(attempt.status!==from)return {result:'STATE_CONFLICT',status:attempt.status};
      if(options.persistFailure&&to==='EXTERNAL_CREATED')throw Error('SYNTHETIC_DB_FAILURE');
      attempt.status=to;if(invoice)attempt.external_invoice_id=invoice;if(to==='SUBMITTING')cas++;
      events.push(to);return {result:'TRANSITIONED',status:to};
    },
    revalidate:async()=>candidate,
    evidence:async(id,status,resultClass,fingerprint)=>{evidence.push({id,status,resultClass,fingerprint});},
    manualReview:async()=>{attempt.status='MANUAL_REVIEW';},
    async deliver(_attempt,content){
      assert.equal(content,options.quantity===2?SYNTHETIC_SECRET+'\nSYNTHETIC_SECOND_CARD':SYNTHETIC_SECRET);
      if(!committed){deliveries++;committed=true;}
      if(options.deliveryCrash&&!crashed){crashed=true;throw Error(SYNTHETIC_SECRET);}
      attempt.status='SUCCEEDED';
    },
  };
  const transport=createKuajingZyPurchaseClient({apiKey:'SYNTHETIC_ONLY_KEY',environment:env,releaseGate:options.releaseGate??true,fetchImpl:async(url,init)=>{
    if(init.method==='POST'){posts++;assert.equal(attempt.status,'SUBMITTING');events.push('POST');
      if(options.timeout)throw Error(SYNTHETIC_SECRET+' timeout');
      if(options.http500)return Response.json({error:{code:'INTERNAL_ERROR',message:SYNTHETIC_SECRET}},{status:500});
      return Response.json({data:{order:syntheticOrder({quantity:candidate.quantity,amount:candidate.quantity===2?0.18:0.09,status:'processing',delivery:''})}});
    }
    gets++;return Response.json({data:syntheticOrder({quantity:candidate.quantity,amount:candidate.quantity===2?0.18:0.09,
      delivery:candidate.quantity===2?SYNTHETIC_SECRET+'\nSYNTHETIC_SECOND_CARD':SYNTHETIC_SECRET,...options.orderPatch})});
  }});
  const client={...transport,
    getProduct:async()=>{
      quoteCalls++;
      if(options.quoteCrash&&!crashed&&quoteCalls===2){crashed=true;throw Error('SYNTHETIC_GET_FAILURE');}
      const p=syntheticProduct();
      if(options.outOfStock)p.item.variants[0].stock=0;
      if(options.highCost)p.item.variants[0].unitPrice=p.item.variants[0].prices.CNY=0.11;
      return p;
    },
    getBalance:async()=>{
      if(options.balanceCrash&&!crashed){crashed=true;throw Error('SYNTHETIC_BALANCE_FAILURE');}
      return {currency:'CNY',availableBalance:options.lowBalance?'0.01':'19.632'};
    },
  };
  if(options.quantity)candidate.quantity=options.quantity;
  if(options.lowMargin)candidate.financials.paidItemAmount='0.10';
  if(options.bindingOff)candidate.binding.enabled=false;
  return {candidate,env,client,db,evidence,events,run:()=>fulfillKuajingZyCandidate({db,client,candidate,env,releaseGate:options.releaseGate??true}),
    attempt:()=>attempt,stats:()=>({posts,gets,deliveries,cas,units:units.length}),units:()=>units};
}

test('synthetic complete paid order persists one attempt, one POST, one private delivery',async()=>{
  const f=fixture();const r=await f.run();
  assert.equal(r.fulfilled,true);assert.deepEqual(f.stats(),{posts:1,gets:1,deliveries:1,cas:1,units:1});
  assert(f.events.indexOf('SUBMITTING')<f.events.indexOf('POST'));assert(f.events.indexOf('EXTERNAL_CREATED')>f.events.indexOf('POST'));
  await f.run();assert.equal(f.stats().posts,1);assert.equal(f.stats().deliveries,1);
  assert(!JSON.stringify(f.evidence).includes(SYNTHETIC_SECRET));
});
test('two concurrent workers have exactly one durable CAS winner and one POST',async()=>{
  const f=fixture();await Promise.all([f.run(),f.run()]);
  assert.equal(f.stats().cas,1);assert.equal(f.stats().posts,1);assert.equal(f.stats().deliveries,1);assert.equal(f.stats().units,1);
});
for(const options of [{timeout:true},{http500:true},{persistFailure:true}])test('unknown submit never makes a second POST '+JSON.stringify(options),async()=>{
  const f=fixture(options);await f.run().catch(()=>{});await f.run();
  assert.equal(f.stats().posts,1);assert.equal(f.stats().deliveries,0);
  assert(['SUBMITTING','UNCERTAIN'].includes(f.attempt().status));
});
for(const options of [{quoteCrash:true},{balanceCrash:true}])test('CLAIMED crash resumes with fresh product, cost and balance '+JSON.stringify(options),async()=>{
  const f=fixture(options);await assert.rejects(f.run());assert.equal(f.attempt().status,'CLAIMED');assert.equal(f.stats().posts,0);
  await f.run();assert.equal(f.stats().posts,1);assert.equal(f.stats().deliveries,1);
});
test('concurrent CLAIMED crash recovery still has one POST',async()=>{
  const f=fixture({quoteCrash:true});await assert.rejects(f.run());await Promise.all([f.run(),f.run()]);
  assert.equal(f.stats().posts,1);assert.equal(f.stats().cas,1);assert.equal(f.stats().deliveries,1);
});
for(const options of [{releaseGate:false},{env:{SUPPLIER_AUTO_PURCHASE_ENABLED:'false'}},
  {env:{KUAJINGZY_REAL_PURCHASE_ENABLED:'false'}},{bindingOff:true},{lowMargin:true},{lowBalance:true},{outOfStock:true},{highCost:true},{overOrder:true}]) {
  test('fail-closed before POST '+JSON.stringify(options),async()=>{const f=fixture(options);await assert.rejects(f.run());assert.equal(f.stats().posts,0);});
}
test('fee and financial-source evidence are required, never assumed zero',async()=>{
  for(const patch of [{paymentFee:'0.95'},{source:'browser_body'},{currency:'USD'},{checkedAt:'2000-01-01T00:00:00Z'},{otherFees:undefined}]) {
    const f=fixture();Object.assign(f.candidate.financials,patch);await assert.rejects(f.run());assert.equal(f.stats().posts,0);
  }
});
test('existing provider order is GET-only even if all purchase flags are now disabled',async()=>{
  const f=fixture({orderPatch:{status:'processing',delivery:''}});await f.run();const n=f.stats().posts;
  f.env.SUPPLIER_AUTO_PURCHASE_ENABLED='false';
  const r=await f.run();assert.equal(r.next,'QUERY_ONLY');assert.equal(f.stats().posts,n);
});
test('frozen cost/binding drift cannot resume CLAIMED',async()=>{
  const f=fixture({quoteCrash:true});await assert.rejects(f.run());f.candidate.binding.maxUnitCost='0.20';
  await assert.rejects(f.run(),/DRIFT/);assert.equal(f.stats().posts,0);
});
test('private commit crash is retried via GET and cannot duplicate private delivery',async()=>{
  const f=fixture({deliveryCrash:true});const r=await f.run();assert.equal(r.fulfilled,false);assert.equal(f.stats().deliveries,1);
  await f.run();assert.equal(f.stats().posts,1);assert.equal(f.stats().deliveries,1);assert.equal(f.attempt().status,'SUCCEEDED');
});
for(const orderPatch of [{delivery:''},{delivery:SYNTHETIC_SECRET+'\nSYNTHETIC_EXTRA_CARD'},
  {refund:{status:'full',amount:0.09,currency:'CNY'}},{itemId:'other'},{skuId:'other'},{amount:0.1}]) {
  test('nonmatching order or delivery never commits '+Object.keys(orderPatch).join(','),async()=>{
    const f=fixture({orderPatch});await f.run();assert.equal(f.stats().deliveries,0);assert.equal(f.stats().posts,1);
  });
}
test('quantity N validates exact unique delivery count',async()=>{
  const f=fixture({quantity:2});await f.run();assert.equal(f.stats().units,2);assert.equal(f.stats().posts,1);assert.equal(f.stats().deliveries,1);
  const bad=fixture({quantity:2,orderPatch:{delivery:SYNTHETIC_SECRET+'\n'+SYNTHETIC_SECRET}});await bad.run();assert.equal(bad.stats().deliveries,0);
});
test('rounding allocation uses existing immutable per-unit costs without fractional loss',()=>{
  const c=syntheticCandidate({quantity:3});c.binding.maxUnitCost='1.00';
  const units=createKuajingZyFrozenUnits(c,'root','0.371');
  assert.deepEqual(units.map(x=>x.quoted_unit_cost),['0.123667','0.123667','0.123666']);
});
test('registry and literal production release remain closed',()=>{
  assert.equal(KUAJINGZY_PURCHASE_RELEASE_ENABLED,false);assert.equal(canSupplierAutoPurchase('kuajingzy'),false);
});
test('binding owner, supplier and max-cost policy are mandatory',()=>{
  const raw={fulfillment_source:'supplier',supplier:'kuajingzy',website_product_id:'product',website_sku_id:'sku',
    supplier_product_id:ITEM,supplier_sku:SKU,supplier_currency:'CNY',supplier_auto_purchase_enabled:false,
    supplier_max_unit_cost:'0.10',supplier_min_unit_profit:'0.01',supplier_min_margin_bps:100};
  assert.equal(parseKuajingZyBinding(raw,'product','sku').enabled,false);
  for(const patch of [{website_product_id:'other'},{supplier:'daju'},{supplier_sku:9},{supplier_max_unit_cost:'0'},{supplier_min_unit_profit:undefined}])assert.throws(()=>parseKuajingZyBinding({...raw,...patch},'product','sku'));
  assert.throws(()=>inspectKuajingZyProduct({...syntheticProduct({id:'other'}),candidate:syntheticCandidate()}));
});
