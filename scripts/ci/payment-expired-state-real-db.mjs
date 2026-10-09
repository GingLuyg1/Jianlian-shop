// Strictly disposable localhost/CI PostgreSQL; no Supabase or Provider credentials.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {loadTs} from '../../tests/helpers/payment-session-guard-harness.mjs';
import {runSnpayDbMatrix} from '../../tests/helpers/snpay-reconciliation-db-matrix.mjs';
import {runSnpayOrderDbMatrix} from '../../tests/helpers/snpay-order-db-matrix.mjs';
const env={CI:'true',PGHOST:'127.0.0.1',PGPORT:'54330',PGDATABASE:'ci_payment_expired_state',
  PGUSER:'postgres',PGPASSWORD:'ci-only-disposable-password'};
for(const[k,v]of Object.entries(env))assert.equal(process.env[k],v,'UNSAFE_DB_ENV:'+k);
for(const k of Object.keys(process.env))if(/SUPABASE|DATABASE_URL|PGHOSTADDR|PGSERVICE|PGOPTIONS/i.test(k))throw Error('EXTERNAL_DB_ENV_FORBIDDEN');
globalThis.fetch=()=>{throw Error('ALL_HTTP_FORBIDDEN');};
const clientEnv={...env,PATH:process.env.PATH,LANG:'C.UTF-8'};
const source=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const migration=source('supabase/migrations/20261008103916_paid_before_expiry_expired_state_completion.sql');
async function sql(input){return new Promise((resolve,reject)=>{
  const child=spawn('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],{env:clientEnv,stdio:['pipe','pipe','pipe']});
  let out='',err='';const timer=setTimeout(()=>child.kill('SIGKILL'),20000);
  child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);
  child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve(out.trim()):reject(Error(err))});child.stdin.end(input);
});}
const uid='10000000-0000-4000-8000-000000000001',rid='10000000-0000-4000-8000-000000000002',sid='10000000-0000-4000-8000-000000000003';
const second='10000000-0000-4000-8000-000000000004';
const t0='2026-01-01T00:00:00Z',expiry='2026-01-01T00:15:00Z',paid='2026-01-01T00:09:00Z';
const rpc=(time=paid,amount='1',currency='CNY')=>`public.complete_payment_session('${sid}','CI-TX',${amount},'${currency}',${time===null?'NULL':`'${time}'`})`;
const call=(expr=rpc())=>`set request.jwt.claim.role='service_role';select ${expr};`;
const snapshot=()=>sql(`select jsonb_build_object('sessions',(select jsonb_agg(to_jsonb(t) order by id) from public.payment_sessions t),
 'recharges',(select jsonb_agg(to_jsonb(t) order by id) from public.account_recharges t),
 'balance',(select balance from public.profiles where id='${uid}'),
 'ledger',(select jsonb_agg(to_jsonb(t) order by id) from public.balance_transactions t));`);
async function reset(){await sql(`truncate public.payment_sessions,public.account_recharges,public.balance_transactions;
 update public.profiles set balance=29 where id='${uid}';
 insert into public.account_recharges(id,recharge_no,user_id,channel,channel_code,provider,currency,status,amount,requested_amount,payable_amount,created_at,expires_at)
 values('${rid}','RC-CI-EXPIRED','${uid}','wechat','wechat','snpay','CNY','expired',1,1,1,'${t0}','${expiry}');
 insert into public.payment_sessions(id,session_no,business_type,business_id,business_no,user_id,channel_code,provider,currency,status,requested_amount,payable_amount,provider_order_no,created_at,expires_at)
 values('${sid}','PS-CI-EXPIRED','recharge','${rid}','RC-CI-EXPIRED','${uid}','wechat','snpay','CNY','expired',1,1,'SN-CI-EXPIRED','${t0}','${expiry}');`);}
async function reject(label,setup,expr=rpc(),message=''){
 await reset();const before=await snapshot();
 await sql(`begin;set local request.jwt.claim.role='service_role';${setup}
 do $test$ declare saved jsonb;begin
  select jsonb_build_object('balance',(select balance from public.profiles where id='${uid}'),
    'sessions',(select jsonb_agg(to_jsonb(t) order by id) from public.payment_sessions t),
    'recharges',(select jsonb_agg(to_jsonb(t) order by id) from public.account_recharges t),
    'ledger',(select jsonb_agg(to_jsonb(t) order by id) from public.balance_transactions t)) into saved;
  begin perform ${expr};raise exception 'TEST_UNEXPECTED_SUCCESS';
  exception when others then
    if sqlerrm='TEST_UNEXPECTED_SUCCESS' ${message?`or position('${message}' in sqlerrm)=0`:''} then raise;end if;
  end;
  if saved is distinct from jsonb_build_object('balance',(select balance from public.profiles where id='${uid}'),
    'sessions',(select jsonb_agg(to_jsonb(t) order by id) from public.payment_sessions t),
    'recharges',(select jsonb_agg(to_jsonb(t) order by id) from public.account_recharges t),
    'ledger',(select jsonb_agg(to_jsonb(t) order by id) from public.balance_transactions t)) then raise exception 'TEST_PARTIAL_MUTATION';end if;
 end $test$;rollback;`);assert.equal(await snapshot(),before);console.log(label+'=yes');
}
async function accounting(time=paid){const result=JSON.parse(await sql(`select jsonb_build_object(
 'session_status',(select status from public.payment_sessions where id='${sid}'),
 'recharge_status',(select status from public.account_recharges where id='${rid}'),
 'paid_at_match',(select paid_at='${time}'::timestamptz from public.payment_sessions where id='${sid}') and
   (select paid_at='${time}'::timestamptz from public.account_recharges where id='${rid}'),
 'credited',(select credited_amount from public.account_recharges where id='${rid}'),
 'balance',(select balance from public.profiles where id='${uid}'),
 'ledger_count',(select count(*) from public.balance_transactions where business_id='RC-CI-EXPIRED' and status='completed'),
 'ledger_valid',(select bool_and(amount=1 and balance_before=29 and balance_after=30 and direction='credit' and currency='CNY') from public.balance_transactions where business_id='RC-CI-EXPIRED'));`));
 assert.equal(result.session_status,'paid');assert.equal(result.recharge_status,'paid');assert.equal(result.paid_at_match,true);
 assert.equal(Number(result.credited),1);assert.equal(Number(result.balance),30);assert.equal(result.ledger_count,1);assert.equal(result.ledger_valid,true);
}
let owned=false;
try{
 assert.equal(await sql("select current_database()||'/'||current_user;"),'ci_payment_expired_state/postgres');
 assert.match(await sql('select inet_server_addr()::text;'),/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/);
 assert.equal(await sql("select count(*) from pg_tables where schemaname in ('public','auth');"),'0','DATABASE_NOT_EMPTY');owned=true;
 await sql(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
 create schema auth;create table auth.users(id uuid primary key,email text);
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;`);
 await sql(source('scripts/ci/payment-watcher-minimal-schema.sql'));
 await sql(`create function public.is_admin(uuid) returns boolean language sql stable as $$select false$$;`);
 await sql(source('tests/fixtures/paid-before-expiry-production-functions.sql'));
 await sql(`insert into auth.users(id) values('${uid}');insert into public.profiles(id,balance) values('${uid}',29);`);
 await reject('THIRD_CANARY_SCENARIO_REPRODUCED','',rpc(),'payment session status does not allow completion');
 const original=await snapshot();
 // Unknown baseline must roll back ALL DDL and leave data untouched.
 await sql("alter function public.complete_payment_session(uuid,text,numeric,text,timestamptz) set search_path=public,pg_catalog;");
 await assert.rejects(sql(migration),/UNKNOWN_CANONICAL_FUNCTION_BASELINE/);
 await sql("alter function public.complete_payment_session(uuid,text,numeric,text,timestamptz) set search_path=public;");
 await sql(migration);assert.equal(await snapshot(),original);console.log('MIGRATION_ZERO_BUSINESS_MUTATION=yes');
 await assert.rejects(sql(migration),/TRUSTED_CREDIT_OVERLOAD_ALREADY_EXISTS/);console.log('UNKNOWN_BASELINE_FAIL_CLOSED=yes');
 await reset();const first=JSON.parse(await sql(call()));assert.equal(first.ok,true);assert.equal(first.idempotent,false);await accounting();
 const secondCall=JSON.parse(await sql(call()));assert.equal(secondCall.idempotent,true);await accounting();
 console.log('EXPIRED_LOCAL_STATE_PAID_BEFORE_EXPIRY_COMPLETES=yes');console.log('SECOND_COMPLETION_IDEMPOTENT=yes');
 await reject('PAID_AFTER_EXPIRY_REJECTED','',rpc('2026-01-01T00:15:01Z'));
 await reject('PAID_BEFORE_CREATED_REJECTED','',rpc('2025-12-31T23:59:59Z'));
 for(const state of ['failed','closed'])await reject(state.toUpperCase()+'_SESSION_REJECTED',`update public.payment_sessions set status='${state}';`);
 for(const state of ['failed','closed','refunded'])await reject(state.toUpperCase()+'_RECHARGE_REJECTED',`update public.account_recharges set status='${state}';`);
 await reject('UNTRUSTED_WRAPPER_EXPIRED_REJECTED','',`public.complete_account_recharge('${rid}','CI-TX',1,'CNY')`);
 await reject('LEGACY_CREDIT_EXPIRED_REJECTED','',`public.credit_account_recharge_balance('RC-CI-EXPIRED','CI-TX',1,'CNY')`);
 await reject('NULL_TRUSTED_TIME_REJECTED','',rpc(null));
 await reject('INFINITE_TRUSTED_TIME_REJECTED','',rpc('infinity'));
 await reject('FUTURE_TRUSTED_TIME_REJECTED',"update public.payment_sessions set expires_at=now()+interval '1 day';update public.account_recharges set expires_at=now()+interval '1 day';",`public.complete_payment_session('${sid}','CI-TX',1,'CNY',statement_timestamp()+interval '6 minutes')`);
 await reject('AMOUNT_MISMATCH_REJECTED','',rpc(paid,'1.03'));
 await reject('CURRENCY_MISMATCH_REJECTED','',rpc(paid,'1','USD'));
 await reject('DUPLICATE_PROVIDER_TX_REJECTED',`insert into public.payment_sessions(id,session_no,business_type,business_id,user_id,channel_code,status,provider_transaction_id)
 values('${second}','PS-CI-OTHER','recharge','${second}','${uid}','wechat','paid','CI-TX');`);
 await reject('DUPLICATE_RECHARGE_PROVIDER_TX_REJECTED',`insert into public.account_recharges(id,recharge_no,user_id,channel,status,provider_trade_no)
 values('${second}','RC-CI-OTHER','${uid}','wechat','pending','CI-TX');`);
 await reject('ORDER_EXPIRY_POLICY_UNCHANGED',"update public.payment_sessions set business_type='order';",rpc(),'payment session status does not allow completion');
 await reject('RECHARGE_EARLIER_EXPIRY_REJECTED',"update public.account_recharges set expires_at='2026-01-01T00:08:59Z';");
 await reject('SESSION_EARLIER_EXPIRY_REJECTED',"update public.payment_sessions set expires_at='2026-01-01T00:08:59Z';");
 await reject('MISSING_EXPIRY_REJECTED','update public.account_recharges set expires_at=null;');
 await reject('AMBIGUOUS_SESSION_REJECTED',`insert into public.payment_sessions(id,session_no,business_type,business_id,user_id,channel_code,status)
 values('${second}','PS-CI-OTHER','recharge','${rid}','${uid}','wechat','failed');`);
 for(const sig of ['complete_payment_session(uuid,text,numeric,text,timestamptz)','complete_account_recharge(uuid,text,numeric,text,timestamptz)',
 'complete_account_recharge(uuid,text,numeric,text)','credit_account_recharge_balance(text,text,numeric,text,timestamptz)']){
   assert.equal(await sql(`select has_function_privilege('anon','public.${sig}','EXECUTE') or has_function_privilege('authenticated','public.${sig}','EXECUTE');`),'f');
 }
 assert.equal(await sql("select has_function_privilege('authenticated','public.credit_account_recharge_balance(text,text,numeric,text)','EXECUTE');"),'t');
 await reject('NON_SERVICE_ROLE_REJECTED',"set local request.jwt.claim.role='authenticated';");
 console.log('ACL_PRESERVED=yes');
  await reject('SESSION_CREATED_BOUND_REJECTED',"update public.payment_sessions set created_at='2026-01-01T00:09:01Z';");
  await reject('RECHARGE_CREATED_BOUND_REJECTED',"update public.account_recharges set created_at='2026-01-01T00:09:01Z';");
  await reject('ALREADY_CREDITED_EXPIRED_REJECTED','update public.account_recharges set credited_amount=1;');
  await reject('PAID_RECHARGE_EXPIRED_SESSION_CONFLICT_REJECTED',"update public.account_recharges set status='paid';");
  await reject('PROVIDER_PINNING_CONFLICT_REJECTED',"update public.payment_sessions set provider='liuhaoyi';");
  await reject('DIRECT_TRUSTED_CREDIT_NULL_TIME_REJECTED','',"public.credit_account_recharge_balance('RC-CI-EXPIRED','CI-TX',1,'CNY',null)");
  await reset();
  const forbidden=()=>{throw Error('ORDER_DELIVERY_FORBIDDEN');};
  const complete=loadTs('lib/payments/complete-payment-service.ts',{
    '@/lib/delivery/delivery-service':{deliverDigitalOrder:forbidden,getDeliveryErrorMessage:forbidden},
    '@/lib/payments/payment-errors':{getSafeErrorMessage:forbidden},
    '@/lib/supabase/service-role':{getSupabaseServiceRoleClient:forbidden},
  }).completePayment;
  let rpcCalls=0;
  const client={rpc:async(name,args)=>{
    assert.equal(name,'complete_payment_session');assert.equal(args.p_session_id,sid);
    assert.equal(args.p_provider_transaction_id,'CI-TX');assert.equal(args.p_paid_amount,1);
    assert.equal(args.p_currency,'CNY');assert.equal(args.p_paid_at,paid);rpcCalls++;
    return {data:JSON.parse(await sql(call())),error:null};
  }};
  assert.equal((await complete({paymentSessionId:sid,providerTransactionId:'CI-TX',amount:1,currency:'CNY',paidAt:paid,source:'reconciliation'},client)).ok,true);
  assert.equal(rpcCalls,1);await accounting();console.log('CANONICAL_RECONCILIATION_SERVICE_PASS=yes');
 await reset();const trueCreated='2026-10-08T09:21:31.967Z',trueExpiry='2026-10-08T09:36:31.967Z',truePaid='2026-10-08T09:30:47Z';
 await sql(`update public.account_recharges set created_at='${trueCreated}',expires_at='${trueExpiry}';update public.payment_sessions set created_at='${trueCreated}',expires_at='${trueExpiry}';`);
 await sql(call(rpc(truePaid)));await accounting(truePaid);console.log('THIRD_CANARY_SCENARIO_FIXED_IN_ISOLATED_DB=yes');
 for(let round=0;round<10;round++){await reset();const results=await Promise.all([sql(call()),sql(call())]);assert.deepEqual(results.map(x=>JSON.parse(x).idempotent).sort(),[false,true]);await accounting();}
 console.log('CONCURRENT_COMPLETION_EXACTLY_ONCE=yes,rounds=10');
 await sql(`create function public.ci_fail_after_credit() returns trigger language plpgsql as $$begin if new.status='paid' then raise exception 'TEST_AFTER_CREDIT';end if;return new;end$$;
 create trigger ci_fail_after_credit before update on public.payment_sessions for each row execute function public.ci_fail_after_credit();`);
 await reject('ATOMIC_ROLLBACK_AFTER_CREDIT','',rpc(),'TEST_AFTER_CREDIT');
 await sql('drop trigger ci_fail_after_credit on public.payment_sessions;drop function public.ci_fail_after_credit();');
 console.log('FAIL_CLOSED_MATRIX_PASS=yes');console.log('REAL_POSTGRES_TESTS_PASS=yes');
 await runSnpayDbMatrix({sql,reset,uid,rid,sid,call,rpc,accounting});
 await runSnpayOrderDbMatrix({sql,uid});
}finally{
 if(owned){assert.equal(await sql("select identity_token from public.ci_payment_watcher_database_identity where singleton;"),'jianlian-payment-watcher-ephemeral-v1');
 await sql('drop schema public cascade;drop schema auth cascade;create schema public;drop role anon;drop role authenticated;drop role service_role;');console.log('CI_DB_CLEANUP_PASS=yes');}
}
