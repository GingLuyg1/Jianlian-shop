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
