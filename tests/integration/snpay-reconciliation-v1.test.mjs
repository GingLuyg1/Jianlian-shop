import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {timingSafeEqual} from 'node:crypto';
import {loadTs} from '../helpers/payment-session-guard-harness.mjs';
import {SNPAY_RECONCILIATION as config,snpayCandidateReason,snpayPaidDecision} from '../../lib/payments/snpay-reconciliation-policy.mjs';
import {runSnpayReconciliationWatcher,snpayExecutionEnabled} from '../../lib/payments/snpay-reconciliation-watcher.mjs';
const now=Date.parse('2026-01-01T01:00:00Z');
const s={id:'10000000-0000-4000-8000-000000000003',session_no:'PS-CI-EXPIRED',business_type:'recharge',business_id:'10000000-0000-4000-8000-000000000002',business_no:'RC-CI-EXPIRED',user_id:'CI-USER',provider:'snpay',channel_code:'wechat',currency:'CNY',payable_amount:1,status:'expired',created_at:'2026-01-01T00:00:00Z',expires_at:'2026-01-01T00:15:00Z',provider_order_no:'CI-TX',last_synced_at:null};
const parent={id:s.business_id,recharge_no:s.business_no,user_id:s.user_id,provider:'snpay',channel_code:'wechat',currency:'CNY',payable_amount:1,status:'expired',created_at:s.created_at,expires_at:s.expires_at,credited_amount:0,completed_at:null};
const paid={found:true,paid:true,status:'paid',currency:'CNY',amount:1,providerChannel:'wechat',providerTransactionId:'CI-TX',paidAt:'2026-01-01T00:09:00Z',rawSummary:{outTradeNo:s.session_no},rawSummarySafe:{signatureVerified:true,timestampVerified:true,identityVerified:true}};
test('SNPAY candidate policy admits recharge pending/processing/expired only, with frozen provider pinning',()=>{
 for(const status of ['pending','processing','expired'])assert.equal(snpayCandidateReason({...s,status},now),null);
 for(const status of ['failed','closed','paid','succeeded','refunded'])assert.equal(snpayCandidateReason({...s,status},now),'state_excluded');
 for(const patch of [{provider:'liuhaoyi'},{business_type:'order'},{channel_code:'usdt_bep20'}])assert.equal(snpayCandidateReason({...s,...patch},now),'scope_excluded');
 assert.equal(snpayCandidateReason({...s,provider_order_no:null},now),'provider_identity_missing');
});
test('conservative persisted throttling and finite 24h lookback',()=>{
 assert.equal(config.lookbackMs,86400000);assert.equal(config.batchSize,4);
 assert.equal(snpayCandidateReason({...s,last_synced_at:new Date(now-299999).toISOString()},now),'throttled');
 assert.equal(snpayCandidateReason({...s,status:'pending',last_synced_at:new Date(now-59999).toISOString()},now),'throttled');
 assert.equal(snpayCandidateReason({...s,created_at:new Date(now-86400001).toISOString()},now),'outside_lookback_or_grace');
 assert.equal(snpayCandidateReason({...s,last_synced_at:'bad'},now),'throttled');
});
test('paid lifetime uses both original expiries and finite trusted time, never now fallback',()=>{
 assert.equal(snpayPaidDecision(s,parent,paid,now).kind,'complete');
 for(const paidAt of [null,'bad','infinity','2026-01-01T00:15:01Z','2025-12-31T23:59:59Z','2026-01-01T01:06:00Z'])assert.equal(snpayPaidDecision(s,parent,{...paid,paidAt},now).kind,'manual_review');
 assert.equal(snpayPaidDecision(s,{...parent,expires_at:'2026-01-01T00:08:59Z'},paid,now).reason,'snpay_late_payment_manual_v1');
});
test('amount/currency/signature/timestamp/type/identity are independent fail-closed gates',()=>{
 for(const patch of [{amount:1.03},{currency:'USD'},{providerChannel:'alipay'},{providerTransactionId:'OTHER'},{rawSummary:{outTradeNo:'OTHER'}},
  ...['signatureVerified','timestampVerified','identityVerified'].map(k=>({rawSummarySafe:{...paid.rawSummarySafe,[k]:false}}))])assert.equal(snpayPaidDecision(s,parent,{...paid,...patch},now).kind,'manual_review');
 assert.equal(snpayPaidDecision(s,parent,{found:false},now).kind,'not_found');
 assert.equal(snpayPaidDecision(s,parent,{...paid,paid:false,status:'pending'},now).kind,'unpaid');
});
test('dual execute gate cannot be bypassed by flag alone or env alone',()=>{
 assert.equal(snpayExecutionEnabled(['--execute'],{}),false);assert.equal(snpayExecutionEnabled([],{SNPAY_RECONCILIATION_EXECUTE_ENABLED:'true'}),false);
 assert.equal(snpayExecutionEnabled(['--execute'],{SNPAY_RECONCILIATION_EXECUTE_ENABLED:'true'}),true);
});
const env={SNPAY_RECONCILIATION_ENABLED:'true',SNPAY_RECONCILIATION_EXECUTE_ENABLED:'true',NEXT_PUBLIC_SUPABASE_URL:'https://db.test',SUPABASE_SECRET_KEY:'CI-KEY-NOT-REAL',PAYMENT_RECONCILIATION_SECRET:'CI-INTERNAL-NOT-REAL',JIANLIAN_INTERNAL_BASE_URL:'http://127.0.0.1:3001'};
test('watcher at most 4 sequential candidates; output/heartbeat contain no identifiers or credentials',async()=>{
 let active=0,max=0,calls=0;const logs=[],heartbeats=[];const rows=Array.from({length:8},(_,i)=>({...s,id:'10000000-0000-4000-8000-00000000000'+i}));
 const result=await runSnpayReconciliationWatcher({env,args:['--execute'],nowMs:now,write:x=>logs.push(x),heartbeat:async x=>heartbeats.push(x),fetchImpl:async(u,i)=>{
   if(new URL(u).hostname==='db.test'){assert.equal(i.headers.Authorization,undefined);assert.equal(new URL(u).searchParams.get('provider'),'eq.snpay');return Response.json(rows);}
   active++;max=Math.max(max,active);calls++;await new Promise(r=>setTimeout(r,2));active--;return Response.json({kind:'unpaid',queried:true,paid:false});
 }});assert.equal(calls,4);assert.equal(max,1);assert.equal(result.unpaid,4);assert.equal(heartbeats.length,1);assert.ok(heartbeats[0].last_successful_run);
 for(const v of [env.SUPABASE_SECRET_KEY,env.PAYMENT_RECONCILIATION_SECRET,s.id,s.session_no,s.provider_order_no])assert.ok(!logs.join('').includes(v));
});
test('outage stops after two errors, no immediate retry or provider request storm',async()=>{
 let calls=0;const rows=Array.from({length:5},(_,i)=>({...s,id:'10000000-0000-4000-8000-00000000000'+i}));
 const r=await runSnpayReconciliationWatcher({env,args:['--execute'],nowMs:now,fetchImpl:async(u)=>{if(new URL(u).hostname==='db.test')return Response.json(rows);calls++;return Response.json({kind:'query_error',queried:true});}});
 assert.equal(calls,2);assert.equal(r.query_error,2);assert.equal(r.status,'partial_failure');
});
test('disabled/execution-denied modes make zero network calls, remote internal URL fails closed',async()=>{
 const forbidden=()=>{throw Error('UNMOCKED_EXTERNAL_NETWORK');};
 assert.equal((await runSnpayReconciliationWatcher({env:{},fetchImpl:forbidden})).status,'disabled');
 assert.equal((await runSnpayReconciliationWatcher({env:{...env,SNPAY_RECONCILIATION_EXECUTE_ENABLED:'false'},args:['--execute'],fetchImpl:forbidden})).status,'execute_not_enabled');
 assert.equal((await runSnpayReconciliationWatcher({env:{...env,JIANLIAN_INTERNAL_BASE_URL:'https://evil.test'},fetchImpl:forbidden})).status,'partial_failure');
});
test('internal API requires secret + execute env and returns safe errors without querying',async()=>{
 let called=0;const oldSecret=process.env.PAYMENT_RECONCILIATION_SECRET,oldGate=process.env.SNPAY_RECONCILIATION_EXECUTE_ENABLED;
 process.env.PAYMENT_RECONCILIATION_SECRET='CI-SECRET';process.env.SNPAY_RECONCILIATION_EXECUTE_ENABLED='false';
 const route=loadTs('app/api/internal/payments/snpay-reconciliation/route.ts',{'node:crypto':{timingSafeEqual},'next/server':{NextResponse:{json:Response.json}},'@/lib/payments/snpay-reconciliation-service':{reconcileSnpaySession:async()=>{called++;return{};}},'@/lib/security/rate-limit':{checkRequestSize:()=>null,checkRateLimit:()=>({allowed:true}),getInternalTaskRateLimitKey:()=>''}});
 try{const req=(secret,execute)=>new Request('http://localhost/internal',{method:'POST',headers:{'x-payment-reconciliation-secret':secret},body:JSON.stringify({sessionId:s.id,execute})});
 assert.equal((await route.POST(req('BAD',true))).status,403);assert.equal((await route.POST(req('CI-SECRET',true))).status,403);assert.equal(called,0);
 assert.equal((await route.POST(req('CI-SECRET',false))).status,200);assert.equal(called,1);
 }finally{if(oldSecret===undefined)delete process.env.PAYMENT_RECONCILIATION_SECRET;else process.env.PAYMENT_RECONCILIATION_SECRET=oldSecret;if(oldGate===undefined)delete process.env.SNPAY_RECONCILIATION_EXECUTE_ENABLED;else process.env.SNPAY_RECONCILIATION_EXECUTE_ENABLED=oldGate;}
});
test('systemd runtime contract is root oneshot/flock, explicit Node, preserves heartbeat; no install performed',()=>{
 const source=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');const unit=source('ops/systemd/jianlian-snpay-reconciliation.service');
 for(const v of ['Type=oneshot','User=root','ProtectHome=true','JIANLIAN_NODE_PATH','--execute','--watcher-lock-held','/run/lock/jianlian-snpay-reconciliation.lock','RuntimeDirectoryPreserve=yes'])assert.ok(unit.includes(v));
 assert.match(source('ops/systemd/jianlian-snpay-reconciliation.timer'),/OnUnitInactiveSec=60s/);
 assert.ok(source('scripts/ops/snpay-reconciliation-watcher.mjs').includes('loadEnvConfig'));
 assert.ok(source('scripts/ops/snpay-reconciliation-watcher.mjs').includes('renameSync'));
});

test('route holds admission before body parsing and releases after malformed/auth/throw paths',async()=>{
 const previous=process.env.PAYMENT_RECONCILIATION_SECRET;process.env.PAYMENT_RECONCILIATION_SECRET='CI-LOCK';
 let active=0,max=0,calls=0,throwService=false,releaseBody;
 const route=loadTs('app/api/internal/payments/snpay-reconciliation/route.ts',{'node:crypto':{timingSafeEqual},'next/server':{NextResponse:{json:Response.json}},'@/lib/payments/snpay-reconciliation-service':{reconcileSnpaySession:async()=>{calls++;active++;max=Math.max(max,active);try{if(throwService)throw Error('CI_SERVICE_ERROR');await new Promise(r=>setTimeout(r,5));return{};}finally{active--;}}},'@/lib/security/rate-limit':{checkRequestSize:()=>null,checkRateLimit:()=>({allowed:true}),getInternalTaskRateLimitKey:()=>''}});
 const req=(body=JSON.stringify({sessionId:s.id,execute:false}),secret='CI-LOCK')=>new Request('http://localhost/internal',{method:'POST',headers:{'x-payment-reconciliation-secret':secret},body});
 try{
  const first=req();first.json=()=>new Promise(resolve=>{releaseBody=()=>resolve({sessionId:s.id,execute:false});});
  const pending=route.POST(first);assert.equal((await route.POST(req())).status,429);assert.equal(calls,0);releaseBody();assert.equal((await pending).status,200);
  assert.equal((await route.POST(req('{'))).status,400);assert.equal((await route.POST(req())).status,200);
  assert.equal((await route.POST(req(undefined,'BAD'))).status,403);assert.equal((await route.POST(req())).status,200);
  throwService=true;assert.equal((await route.POST(req())).status,500);throwService=false;assert.equal((await route.POST(req())).status,200);
  const concurrent=await Promise.all([route.POST(req()),route.POST(req())]);assert.deepEqual(concurrent.map(x=>x.status).sort(),[200,429]);assert.equal(max,1);
 }finally{if(previous===undefined)delete process.env.PAYMENT_RECONCILIATION_SECRET;else process.env.PAYMENT_RECONCILIATION_SECRET=previous;}
});

function scanFixture(invalidCount,validCount=1){
 const rows=Array.from({length:invalidCount+validCount},(_,i)=>({...s,id:'10000000-0000-4000-8000-'+String(i).padStart(12,'0'),provider_order_no:i<invalidCount?'   ':'CI-TX'}));
 let pages=0,calls=0,active=0,max=0;const states=[];
 return {states,get pages(){return pages;},get calls(){return calls;},get max(){return max;},
  fetch:async(u)=>{const url=new URL(u);if(url.hostname==='db.test'){
   pages++;assert.equal(url.searchParams.get('limit'),'40');assert.deepEqual(url.searchParams.getAll('provider_order_no'),['not.is.null','neq.']);assert.equal(url.searchParams.get('order'),'created_at.asc,id.asc');
   const after=url.searchParams.get('and')?.match(/id.gt.([0-9a-f-]+)/)?.[1];return Response.json(rows.filter(r=>!after||r.id>after).slice(0,40));}
   calls++;active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,1));active--;return Response.json({kind:'unpaid',queried:true,paid:false});},
  heartbeat:async h=>states.push(h)};
}
test('40 invalid prefix cannot starve the 41st valid row; serial and bounded',async()=>{
 const f=scanFixture(40);const r=await runSnpayReconciliationWatcher({env,nowMs:now,fetchImpl:f.fetch,heartbeat:f.heartbeat});
 assert.equal(f.pages,2);assert.equal(f.calls,1);assert.equal(f.max,1);assert.equal(r.scanned,41);assert.equal(r.skipped_invalid,40);assert.equal(r.provider_queries,1);assert.equal(r.progress_made,true);assert.equal(r.status,'finished');assert.ok(f.states[0].last_successful_run);
});
test('scan cap is 160 and saved cursor resumes beyond a longer invalid prefix next run',async()=>{
 const f=scanFixture(200);const a=await runSnpayReconciliationWatcher({env,nowMs:now,fetchImpl:f.fetch,heartbeat:f.heartbeat});
 assert.equal(a.scanned,160);assert.equal(f.pages,4);assert.equal(f.calls,0);assert.equal(a.status,'no_progress');assert.equal(a.stop_reason,'scan_limit');assert.equal(a.remaining,true);assert.equal(f.states[0].last_successful_run,null);
 const b=await runSnpayReconciliationWatcher({env,nowMs:now,scanCursor:f.states[0].scan_cursor,fetchImpl:f.fetch,heartbeat:f.heartbeat});
 assert.equal(b.scanned,41);assert.equal(f.calls,1);assert.equal(b.progress_made,true);assert.equal(b.remaining,false);assert.equal(f.states[1].scan_cursor,null);
});
test('heartbeat distinguishes empty queue, all-invalid queue and safe bounded logs',async()=>{
 for(const [count,status,reason] of [[0,'finished','empty'],[5,'no_progress','no_effective_candidates']]){
  const f=scanFixture(count,0),logs=[];const r=await runSnpayReconciliationWatcher({env,nowMs:now,fetchImpl:f.fetch,heartbeat:f.heartbeat,write:x=>logs.push(x)});
  assert.equal(r.status,status);assert.equal(r.stop_reason,reason);assert.equal(r.progress_made,false);assert.equal(r.provider_queries,0);assert.equal(r.remaining,false);assert.equal(logs.length,1);assert.ok(!logs[0].includes('scan_cursor'));assert.ok(!logs[0].includes(s.session_no));
 }
});
test('provider errors stop at two and do not mark successful heartbeat',async()=>{
 const f=scanFixture(0,8);let queries=0;const r=await runSnpayReconciliationWatcher({env,nowMs:now,heartbeat:f.heartbeat,fetchImpl:async(u)=>new URL(u).hostname==='db.test'?f.fetch(u):(queries++,Response.json({kind:'query_error',queried:true}))});
 assert.equal(queries,2);assert.equal(r.provider_queries,2);assert.equal(r.error_count,2);assert.equal(r.stop_reason,'error_guard');assert.equal(r.status,'partial_failure');assert.equal(f.states[0].last_successful_run,null);
});
