import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadTs} from '../helpers/payment-session-guard-harness.mjs';
import * as policy from '../../lib/payments/snpay-reconciliation-policy.mjs';
import {runSnpayReconciliationWatcher} from '../../lib/payments/snpay-reconciliation-watcher.mjs';
const now=Date.parse('2026-01-01T01:00:00Z');
const session={id:randomUUID(),business_type:'order',business_id:randomUUID(),business_no:'ORD-CI',user_id:'CI-USER',provider:'snpay',channel_code:'wechat',currency:'CNY',payable_amount:100,fee_amount:0,session_no:'PS-CI',provider_order_no:'CI-TX',status:'pending',created_at:'2026-01-01T00:00:00Z',expires_at:'2026-01-01T00:15:00Z',last_synced_at:null,updated_at:'2026-01-01T00:00:01Z'};
const order={id:session.business_id,order_no:session.business_no,user_id:session.user_id,status:'pending_payment',payment_status:'unpaid',payment_method:'wechat',total_amount:100,currency:'CNY',created_at:session.created_at,payment_expires_at:session.expires_at,reservation_released_at:null};
const paid={found:true,paid:true,status:'paid',amount:100,currency:'CNY',providerChannel:'wechat',providerTransactionId:session.provider_order_no,paidAt:'2026-01-01T00:09:00Z',rawSummary:{outTradeNo:session.session_no},rawSummarySafe:{signatureVerified:true,timestampVerified:true,identityVerified:true}};
function fixture({s={},o={},q={},afterQuery=null,missing=false}={}) {
 const row={...session,...s},parent=missing?null:{...order,...o},evidence=[];let queries=0,completions=0;
 const client={from(table){let filters=[],operation=null,payload=null;const rows=table==='payment_sessions'?[row]:table==='orders'?parent?[parent]:[]:evidence;
  const x={select(){return x;},eq(k,v){filters.push(r=>r[k]===v);return x;},is(k,v){filters.push(r=>r[k]===v);return x;},in(k,v){filters.push(r=>v.includes(r[k]));return x;},
   update(v){assert.equal(table,'payment_sessions');operation='update';payload=v;return x;},upsert(v){assert.equal(table,'payment_reconciliations');operation='upsert';payload=v;return x;},
   async run(single=false){const found=rows.filter(r=>filters.every(f=>f(r)));if(operation==='update')found.forEach(r=>Object.assign(r,payload));if(operation==='upsert'){const old=evidence.find(r=>r.dedupe_key===payload.dedupe_key);if(old)Object.assign(old,payload);else evidence.push(payload);}return{data:structuredClone(single?found[0]??null:found),error:null};},maybeSingle(){return x.run(true);},then(a,b){return x.run().then(a,b);}};return x;}};
 const worker=loadTs('lib/payments/snpay-reconciliation-service.ts',{'node:crypto':{randomUUID},'@/lib/payments/snpay-reconciliation-policy.mjs':policy,
  '@/lib/payments/complete-payment-service':{completePayment:async(input)=>{assert.equal(input.source,'reconciliation');assert.equal(input.amount,100);completions++;return{idempotent:false};}},
  '@/lib/payments/providers':{resolveProviderForExistingSession:()=>{throw Error('EXTERNAL_QUERY_FORBIDDEN');}},'@/lib/supabase/service-role':{getSupabaseServiceRoleClient:()=>client}}).reconcileSnpaySession;
 return {row,parent,evidence,get queries(){return queries;},get completions(){return completions;},run:async()=>{
  const old=process.env.SNPAY_RECONCILIATION_EXECUTE_ENABLED;process.env.SNPAY_RECONCILIATION_EXECUTE_ENABLED='true';try{return await worker({sessionId:row.id,execute:true},{client,nowMs:now,query:async()=>{queries++;if(afterQuery)afterQuery(row,parent);return{...paid,...q};}});}finally{if(old===undefined)delete process.env.SNPAY_RECONCILIATION_EXECUTE_ENABLED;else process.env.SNPAY_RECONCILIATION_EXECUTE_ENABLED=old;}
 }};
}
test('order decision accepts only frozen reserved pending order; no current catalog price',()=>{
 assert.equal(policy.snpayOrderPaidDecision(session,{...order,product_price:9999},paid,now).kind,'complete');
 assert.equal(policy.snpayOrderPaidDecision(session,order,{...paid,paid:false,status:'pending'},now).kind,'unpaid');
 assert.equal(policy.snpayOrderPaidDecision(session,order,{found:false},now).kind,'not_found');
});
for(const status of ['failed','closed','paid','expired'])test(`session ${status}: zero query and completion`,async()=>{const f=fixture({s:{status}});await f.run();assert.equal(f.queries,0);assert.equal(f.completions,0);});
for(const status of ['cancelled','expired','refunded','failed'])test(`terminal order ${status}: manual review, zero query, deduped evidence`,async()=>{
 const f=fixture({o:{status}});assert.equal((await f.run()).kind,'manual_review');await f.run();assert.equal(f.queries,0);assert.equal(f.completions,0);assert.equal(f.evidence.length,1);assert.equal(f.evidence[0].business_type,'order');assert.equal(f.evidence[0].business_id,'ORD-CI');assert.equal(f.evidence[0].provider_summary.paid,null);
});
for(const [label,options] of Object.entries({missing:{missing:true},wrong_no:{o:{order_no:'OTHER'}},wrong_id:{o:{id:randomUUID()}},wrong_user:{o:{user_id:'OTHER'}},amount:{o:{total_amount:103}},currency:{o:{currency:'USD'}},channel:{o:{payment_method:'alipay'}},already_paid:{o:{payment_status:'paid'}},over_limit:{o:{total_amount:2001},s:{payable_amount:2001}},provider_order:{s:{provider_order_no:null}},session_no:{s:{session_no:null}},invalid_expiry:{o:{payment_expires_at:'bad'}}}))test(`${label}: local block before query`,async()=>{const f=fixture(options);await f.run();assert.equal(f.queries,0);assert.equal(f.completions,0);});
test('released inventory never resurrected',async()=>{const f=fixture({o:{reservation_released_at:order.created_at}});assert.equal((await f.run()).reason,'order_inventory_released');assert.equal(f.queries,0);assert.equal(f.completions,0);});
for(const [label,q] of Object.entries({signature:{rawSummarySafe:{...paid.rawSummarySafe,signatureVerified:false}},timestamp:{rawSummarySafe:{...paid.rawSummarySafe,timestampVerified:false}},identity:{rawSummarySafe:{...paid.rawSummarySafe,identityVerified:false}},transaction:{providerTransactionId:'OTHER'},order_no:{rawSummary:{outTradeNo:'OTHER'}},channel:{providerChannel:'alipay'},money:{amount:103},currency:{currency:'USD'},missing_time:{paidAt:null},before_created:{paidAt:'2025-12-31T23:59:59Z'},late:{paidAt:'2026-01-01T00:15:01Z'},future:{paidAt:'2026-01-01T01:06:00Z'}}))test(`untrusted ${label}: zero completion`,async()=>{const f=fixture({q});assert.equal((await f.run()).kind,'manual_review');assert.equal(f.queries,1);assert.equal(f.completions,0);});
test('expiry after verified paid query preserves trusted evidence without completion',async()=>{
 const f=fixture({afterQuery:(_s,o)=>{o.status='expired';o.reservation_released_at='2026-01-01T00:16:00Z';}});assert.equal((await f.run()).kind,'manual_review');assert.equal(f.completions,0);assert.equal(f.evidence[0].provider_summary.paid,true);assert.equal(f.evidence[0].provider_summary.identityVerified,true);assert.equal(f.evidence[0].provider_summary.paidAt,paid.paidAt);
 f.row.last_synced_at=null;await f.run();await f.run();assert.equal(f.queries,1);assert.equal(f.evidence.filter(e=>e.provider_summary.paid===true).length,1);assert.equal(f.evidence.length,2);
});
test('after network frozen expiry change fails closed',async()=>{const f=fixture({afterQuery:(s)=>{s.expires_at='2026-01-01T00:20:00Z';}});assert.equal((await f.run()).kind,'manual_review');assert.equal(f.completions,0);});
test('order complete only calls canonical service with principal',async()=>{const f=fixture();assert.equal((await f.run()).completed,true);assert.equal(f.completions,1);});
test('long invalid order prefix keeps persisted cursor and four serial query budget',async()=>{
 const rows=Array.from({length:204},(_,i)=>({...session,id:'10000000-0000-4000-8000-'+String(i).padStart(12,'0'),provider_order_no:i<200?' ':'CI-TX'}));let cursor=null,queries=0,active=0,max=0;
 const fetchImpl=async(u,i)=>{if(i?.method==='GET')return Response.json({executeEnabled:true});const url=new URL(u);if(url.hostname==='db.test'){assert.equal(url.searchParams.get('business_type'),'in.(recharge,account_recharge,order)');const after=url.searchParams.get('and')?.match(/id.gt.([a-f0-9-]+)/)?.[1];return Response.json(rows.filter(r=>!after||r.id>after).slice(0,40));}queries++;active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,1));active--;return Response.json({kind:'unpaid',queried:true});};
 const env={SNPAY_RECONCILIATION_ENABLED:'true',SNPAY_RECONCILIATION_EXECUTE_ENABLED:'true',NEXT_PUBLIC_SUPABASE_URL:'https://db.test',SUPABASE_SECRET_KEY:'CI-FAKE',PAYMENT_RECONCILIATION_SECRET:'CI-FAKE-INTERNAL',JIANLIAN_INTERNAL_BASE_URL:'http://127.0.0.1:3001'};
 const a=await runSnpayReconciliationWatcher({env,args:['--execute'],nowMs:now,fetchImpl,heartbeat:async h=>{cursor=h.scan_cursor;}});assert.equal(a.scanned,160);assert.equal(queries,0);
 const b=await runSnpayReconciliationWatcher({env,args:['--execute'],nowMs:now,fetchImpl,scanCursor:cursor});assert.equal(queries,4);assert.equal(max,1);assert.equal(b.order_candidates,4);assert.equal(b.recharge_candidates,0);
});
