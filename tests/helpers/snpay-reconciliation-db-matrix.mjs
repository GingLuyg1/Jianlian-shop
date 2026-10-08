import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {loadTs} from './payment-session-guard-harness.mjs';
import * as policy from '../../lib/payments/snpay-reconciliation-policy.mjs';
import * as core from '../../lib/payments/providers/snpay-core.mjs';
import {runSnpayReconciliationWatcher} from '../../lib/payments/snpay-reconciliation-watcher.mjs';

// Real SQL adapter, not a DB mock: all reads, conditional claims, evidence and
// canonical RPC calls execute against the isolated native PostgreSQL engine.
export async function runSnpayDbMatrix({sql,reset,uid,rid,sid,call,rpc,accounting}) {
  const quote=v=>v==null?'NULL':typeof v==='number'?String(v):typeof v==='object'?"'"+JSON.stringify(v).replace(/'/g,"''")+"'::jsonb":"'"+String(v).replace(/'/g,"''")+"'";
  const ident=v=>{assert.match(v,/^[a-z_]+$/);return v;};
  let rpcCalls=0,queries=0,bodyOverrides={},hang=false;
  const keys=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  const envKeys=['SNPAY_MERCHANT_ID','SNPAY_API_BASE','SNPAY_SITE_URL','SNPAY_PRIVATE_KEY_FILE','SNPAY_PLATFORM_PUBLIC_KEY_FILE','SNPAY_TIMEOUT_MS','SNPAY_RECONCILIATION_EXECUTE_ENABLED'];
  const previous=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
  Object.assign(process.env,{SNPAY_MERCHANT_ID:'1074',SNPAY_API_BASE:'https://provider.test',SNPAY_SITE_URL:'https://site.test',SNPAY_PRIVATE_KEY_FILE:'private.fixture',SNPAY_PLATFORM_PUBLIC_KEY_FILE:'public.fixture',SNPAY_TIMEOUT_MS:'1000',SNPAY_RECONCILIATION_EXECUTE_ENABLED:'true'});
  const now=Date.parse('2026-01-01T01:00:00Z');
  const moneySnapshot=()=>sql(`select jsonb_build_object('balance',(select balance from public.profiles where id='${uid}'),
    'ledger',(select jsonb_agg(to_jsonb(t) order by id) from public.balance_transactions t),
    'sessions',(select jsonb_agg(to_jsonb(t)-'last_synced_at'-'updated_at' order by id) from public.payment_sessions t),
    'recharges',(select jsonb_agg(to_jsonb(t) order by id) from public.account_recharges t));`);
  const client={
    rpc:async(name,args)=>{assert.equal(name,'complete_payment_session');rpcCalls++;
      const expr=`public.complete_payment_session(${quote(args.p_session_id)}::uuid,${quote(args.p_provider_transaction_id)},${quote(args.p_paid_amount)},${quote(args.p_currency)},${quote(args.p_paid_at)}::timestamptz)`;
      try{return {data:JSON.parse(await sql(call(expr))),error:null};}catch{return{data:null,error:{code:'CI_RPC_REJECTED'}};}
    },
    from(table){assert.ok(['payment_sessions','account_recharges','payment_reconciliations'].includes(table));let filters=[],operation=null,payload=null;
      const q={select(){return q;},eq(k,v){filters.push(ident(k)+'='+quote(v));return q;},is(k,v){assert.equal(v,null);filters.push(ident(k)+' IS NULL');return q;},in(k,v){filters.push(ident(k)+' IN ('+v.map(quote).join(',')+')');return q;},
        update(v){operation='update';payload=v;return q;},upsert(v,opt){assert.equal(table,'payment_reconciliations');assert.equal(opt.onConflict,'dedupe_key');operation='upsert';payload=v;return q;},
        async run(single=false){try{let query;if(operation==='update')query=`update public.${table} set ${Object.entries(payload).map(([k,v])=>ident(k)+'='+quote(v)).join(',')} where ${filters.join(' AND ')} returning *`;
          else if(operation==='upsert'){const k=Object.keys(payload);query=`insert into public.${table}(${k.map(ident).join(',')}) values(${k.map(x=>quote(payload[x])).join(',')}) on conflict(dedupe_key) do update set ${k.map(x=>ident(x)+'=excluded.'+ident(x)).join(',')} returning *`;}
          else query=`select * from public.${table}${filters.length?' where '+filters.join(' AND '):''}`;
          const text=await sql(`with rows as (${query}) select coalesce(jsonb_agg(to_jsonb(rows)),'[]'::jsonb) from rows;`),data=JSON.parse(text);return{data:single?data[0]??null:data,error:null};
        }catch(error){return {data:null,error:{code:'CI_SQL_ERROR',message:error.message}};}},maybeSingle(){return q.run(true);},then(a,b){return q.run().then(a,b);}};return q;
    },
  };
  const forbidden=()=>{throw Error('UNEXPECTED_NETWORK_OR_ORDER_DELIVERY');};
  const complete=loadTs('lib/payments/complete-payment-service.ts',{'@/lib/delivery/delivery-service':{deliverDigitalOrder:forbidden,getDeliveryErrorMessage:forbidden},'@/lib/payments/payment-errors':{getSafeErrorMessage:forbidden},'@/lib/supabase/service-role':{getSupabaseServiceRoleClient:forbidden}});
  const mockFetch=async(u,i)=>{
    assert.equal(new URL(u).pathname,'/api/pay/query');queries++;
    if(hang)return new Promise((_,reject)=>{i.signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'})),{once:true});});
    const form=new URLSearchParams(i.body);const body={code:0,pid:'1074',trade_no:form.get('trade_no'),out_trade_no:'PS-CI-EXPIRED',type:'wxpay',money:'1.00',status:'1',endtime:'2026-01-01 08:09:00',timestamp:String(Math.floor(Date.now()/1000)),...bodyOverrides};
    return Response.json({...body,sign:core.createSnpaySignature(body,keys.privateKey),sign_type:'RSA'});
  };
  const adapter=loadTs('lib/payments/providers/snpay.ts',{'node:fs':{readFileSync:p=>{assert.ok(['private.fixture','public.fixture'].includes(p));return p==='private.fixture'?keys.privateKey:keys.publicKey;}},'@/lib/payments/providers/snpay-core.mjs':{...core,createSnpayClient:options=>core.createSnpayClient({...options,fetchImpl:mockFetch})}}).snpayProvider;
  const worker=loadTs('lib/payments/snpay-reconciliation-service.ts',{'node:crypto':{randomUUID},'@/lib/payments/complete-payment-service':complete,'@/lib/payments/providers':{resolveProviderForExistingSession:s=>{assert.equal(s.provider,'snpay');return adapter;}},'@/lib/supabase/service-role':{getSupabaseServiceRoleClient:forbidden},'@/lib/payments/snpay-reconciliation-policy.mjs':policy}).reconcileSnpaySession;
  const run=()=>worker({sessionId:sid,execute:true},{client,nowMs:now});
  async function setup(status='expired'){await reset();await sql('truncate public.payment_reconciliations;');if(status!=='expired')await sql(`update public.payment_sessions set status='${status}';update public.account_recharges set status='${status}';`);queries=0;rpcCalls=0;bodyOverrides={};hang=false;}
  async function noCredit(label,changes,kind,queryCount=1,status='expired'){
    await setup(status);if(changes)await changes();const before=await moneySnapshot();const r=await run();assert.equal(r.kind,kind,label);assert.equal(queries,queryCount,label);assert.equal(rpcCalls,0,label);assert.equal(await moneySnapshot(),before,label);console.log(label+'=yes');
  }
  try{
    await noCredit('SNPAY_PENDING_UNPAID',async()=>{bodyOverrides={status:'0'};},'unpaid',1,'pending');
    for(const state of ['pending','processing','expired']){await setup(state);const r=await run();assert.equal(r.completed,true);assert.equal(queries,1);assert.equal(rpcCalls,1);await accounting();assert.equal((await run()).queried,false);await accounting();console.log('SNPAY_'+state.toUpperCase()+'_PAID_EXACTLY_ONCE=yes');}
    await noCredit('SNPAY_AFTER_EXPIRY_BLOCKED',async()=>{bodyOverrides={endtime:'2026-01-01 08:15:01'};},'manual_review');
    await noCredit('SNPAY_MISSING_TIME_BLOCKED',async()=>{bodyOverrides={endtime:''};},'manual_review');
    await noCredit('SNPAY_BEFORE_CREATED_BLOCKED',async()=>{bodyOverrides={endtime:'2026-01-01 07:59:59'};},'manual_review');
    await noCredit('SNPAY_AMOUNT_MISMATCH_BLOCKED',async()=>{bodyOverrides={money:'1.03'};},'query_error');
    await noCredit('SNPAY_CURRENCY_MISMATCH_BLOCKED',async()=>{await sql("update public.payment_sessions set currency='USD';");},'skipped',0);
    for(const state of ['failed','closed'])await noCredit('SNPAY_'+state.toUpperCase()+'_NO_QUERY',null,'skipped',0,state);
    await noCredit('SNPAY_TIMEOUT_NO_CORRUPTION',async()=>{hang=true;},'query_error');
    await noCredit('SNPAY_NOT_FOUND_NO_CREDIT',async()=>{bodyOverrides={code:-1,msg:'not found'};},'query_error');
    await setup();const missingBefore=await moneySnapshot();const missing=await worker({sessionId:sid,execute:true},{client,nowMs:now,query:async()=>{queries++;return{found:false,paid:false,status:'not_found'};}});
    assert.equal(missing.kind,'not_found');assert.equal(queries,1);assert.equal(rpcCalls,0);assert.equal(await moneySnapshot(),missingBefore);console.log('SNPAY_FOUND_FALSE_NO_FALSE_FAILURE=yes');
    await setup();const before=await moneySnapshot();const dry=await worker({sessionId:sid},{client,nowMs:now});assert.equal(dry.kind,'would_complete');assert.equal(queries,1);assert.equal(rpcCalls,0);assert.equal(await moneySnapshot(),before);assert.equal(await sql('select count(*) from public.payment_reconciliations;'),'0');assert.equal(await sql('select last_synced_at is null from public.payment_sessions;'),'t');console.log('SNPAY_DRY_RUN_ZERO_MUTATION=yes');
    await noCredit('SNPAY_PROVIDER_PINNING_BLOCKED',async()=>{await sql("update public.account_recharges set provider='liuhaoyi';");},'skipped',0);
    await noCredit('SNPAY_OLD_FAILED_CANARY_EXCLUDED',async()=>{await sql("update public.payment_sessions set status='failed';update public.account_recharges set status='expired';");},'skipped',0);
    for(let round=0;round<10;round++){
      await setup();const r=await Promise.all([run(),run()]);assert.equal(r.filter(x=>x.completed).length,1);assert.equal(queries,1);assert.equal(rpcCalls,1);await accounting();
    }console.log('SNPAY_WORKER_WORKER_RACE_PASS=yes,rounds=10');
    for(let round=0;round<10;round++){
      await setup('pending');await Promise.all([run(),complete.completePayment({paymentSessionId:sid,providerTransactionId:'SN-CI-EXPIRED',amount:1,currency:'CNY',paidAt:'2026-01-01T00:09:00Z',source:'callback'},client)]);await accounting();assert.ok(rpcCalls<=2);assert.ok(queries<=1);
    }console.log('SNPAY_WORKER_CALLBACK_RACE_PASS=yes,rounds=10');
    await setup('pending');bodyOverrides={status:'0'};await run();await sql('update public.payment_sessions set last_synced_at=null;');await run();
    assert.equal(await sql('select count(*) from public.payment_reconciliations;'),'1');assert.equal(await sql('select count(*) from public.balance_transactions;'),'0');console.log('SNPAY_RECONCILIATION_DB_DEDUPE_PASS=yes');
    await setup();const untrustedBefore=await moneySnapshot();const badCurrency=await worker({sessionId:sid,execute:true},{client,nowMs:now,query:async()=>({found:true,paid:true,status:'paid',amount:1,currency:'USD',providerChannel:'wechat',providerTransactionId:'SN-CI-EXPIRED',paidAt:'2026-01-01T00:09:00Z',rawSummary:{outTradeNo:'PS-CI-EXPIRED'},rawSummarySafe:{signatureVerified:true,timestampVerified:true,identityVerified:true}})});
    assert.equal(badCurrency.kind,'manual_review');assert.equal(rpcCalls,0);assert.equal(await moneySnapshot(),untrustedBefore);console.log('SNPAY_QUERY_CURRENCY_MISMATCH_BLOCKED=yes');
    // Genuine watcher -> authenticated internal route -> worker -> RSA mock
    // Provider -> native DB -> unchanged completePayment -> canonical RPC.
    await setup();const route=loadTs('app/api/internal/payments/snpay-reconciliation/route.ts',{'node:crypto':await import('node:crypto'),'next/server':{NextResponse:{json:Response.json}},'@/lib/payments/snpay-reconciliation-service':{reconcileSnpaySession:o=>worker(o,{client,nowMs:now})},'@/lib/security/rate-limit':{checkRequestSize:()=>null,checkRateLimit:()=>({allowed:true}),getInternalTaskRateLimitKey:()=>''}});
    const previousSecret=process.env.PAYMENT_RECONCILIATION_SECRET;process.env.PAYMENT_RECONCILIATION_SECRET='CI-ONLY-INTERNAL';
    try{const summary=await runSnpayReconciliationWatcher({env:{SNPAY_RECONCILIATION_ENABLED:'true',SNPAY_RECONCILIATION_EXECUTE_ENABLED:'true',NEXT_PUBLIC_SUPABASE_URL:'https://db.test',SUPABASE_SECRET_KEY:'CI-ONLY-KEY',PAYMENT_RECONCILIATION_SECRET:'CI-ONLY-INTERNAL',JIANLIAN_INTERNAL_BASE_URL:'http://127.0.0.1:3001'},args:['--execute'],nowMs:now,fetchImpl:async(u,i)=>{
      if(new URL(u).hostname==='db.test')return Response.json((await client.from('payment_sessions').select('*')).data);
      assert.equal(new URL(u).pathname,'/api/internal/payments/snpay-reconciliation');return route.POST(new Request(u,i));
    }});assert.equal(summary.completed,1);assert.equal(summary.checked,1);assert.equal(queries,1);await accounting();}finally{if(previousSecret===undefined)delete process.env.PAYMENT_RECONCILIATION_SECRET;else process.env.PAYMENT_RECONCILIATION_SECRET=previousSecret;}
    console.log('SNPAY_WATCHER_WORKER_RSA_DB_CHAIN_PASS=yes');
    console.log('REAL_DB_RECONCILIATION_MATRIX_PASS=yes');console.log('EXACTLY_ONCE_RECONCILIATION_PASS=yes');
  }finally{for(const[k,v]of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;}
}
