// CI-only disposable PostgreSQL. No Supabase credentials, HTTP, or real Provider.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { harness, fixture, failedRow, deferred, source, uid, rid } from '../../tests/helpers/payment-session-guard-harness.mjs';

const expected={CI:'true',GITHUB_ACTIONS:'true',PGHOST:'127.0.0.1',PGPORT:'54329',
  PGDATABASE:'ci_payment_session_guard',PGUSER:'postgres',PGPASSWORD:'ci-only-disposable-password'};
for(const [key,value] of Object.entries(expected)) assert.equal(process.env[key],value,'UNSAFE_DB_ENV:'+key);
for(const key of Object.keys(process.env)) {
  if (/SUPABASE|DATABASE_URL|PGHOSTADDR|PGSERVICE|PGOPTIONS/i.test(key)) throw Error('UNSAFE_EXTERNAL_DB_ENV:'+key);
}
globalThis.fetch=()=>{throw Error('ALL_HTTP_FORBIDDEN');};
const env={...expected,PATH:process.env.PATH,LANG:'C.UTF-8'};
const literal=v=>v===null||v===undefined?'NULL':"'"+String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")+"'";
const identifier=k=>{assert.match(k,/^[a-z_]+$/);return '"'+k+'"';};
async function sql(text) {
  return new Promise((resolve,reject)=>{
    const child=spawn('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],{env,stdio:['pipe','pipe','pipe']});
    let out='',err='';const timeout=setTimeout(()=>child.kill('SIGKILL'),15000);
    child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
    child.on('error',e=>{clearTimeout(timeout);reject(e);});
    child.on('close',code=>{clearTimeout(timeout);code===0?resolve(out.trim()):reject(Error('CI_SQL_FAILED:'+code+':'+err));});
    child.stdin.end(text);
  });
}
const json=async text=>JSON.parse(await sql(text));
const tables=new Set(['account_recharges','payment_sessions','profiles','balance_transactions','payment_reconciliations','payment_channels','orders']);
const read=async table=>{assert.ok(tables.has(table));return json(`select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.${identifier(table)} t;`);};
async function insert(table,row) {
  assert.ok(tables.has(table));const keys=Object.keys(row);
  return json(`with written as (insert into public.${identifier(table)} (${keys.map(identifier)}) values (${keys.map(k=>literal(row[k]))}) returning *) select jsonb_agg(to_jsonb(written)) from written;`);
}
async function write(table,operation,payload,matched) {
  assert.ok(['payment_sessions','account_recharges'].includes(table),'FUNDS_WRITE_FORBIDDEN');
  if(operation==='insert') return insert(table,payload);
  if(!matched.length) return [];
  return json(`with written as (update public.${identifier(table)} set ${Object.keys(payload).map(k=>identifier(k)+'='+literal(payload[k])).join(',')}
    where id in (${matched.map(r=>literal(r.id)).join(',')}) returning *) select jsonb_agg(to_jsonb(written)) from written;`);
}
const argumentNames=['session_no','business_type','business_id','business_no','user_id','channel_code','provider','currency','network','requested_amount','fee_amount','payable_amount','expires_at'];
const reserve=async args=>json(`set request.jwt.claim.role='service_role'; select public.reserve_payment_session(${argumentNames.map(k=>literal(args['p_'+k])).join(',')});`);
const backend={read,write,reserve};
async function reset(provider='snpay',channel='alipay') {
  await sql('truncate public.payment_sessions, public.account_recharges, public.payment_channels, public.orders;');
  const data=fixture(provider,channel);await insert('account_recharges',data.account_recharges[0]);await insert('payment_channels',data.payment_channels[0]);return data;
}
const args=data=>{const r=data.account_recharges[0];return {p_session_no:'PS_CI_'+randomUUID(),p_business_type:'recharge',p_business_id:r.id,
  p_business_no:r.recharge_no,p_user_id:r.user_id,p_channel_code:r.channel_code,p_provider:r.provider,p_currency:'CNY',p_network:null,
  p_requested_amount:1,p_fee_amount:0,p_payable_amount:1,p_expires_at:r.expires_at};};
const funds=async()=>JSON.stringify(await Promise.all(['profiles','balance_transactions','payment_reconciliations'].map(read)));
let owned=false;
try {
  assert.equal(await sql("select current_database()||'/'||current_user;"),'ci_payment_session_guard/postgres');
  // Docker's server-side address is its private bridge address, not host loopback.
  // Client target is strictly 127.0.0.1:54329 above; service credentials are CI-only.
  assert.match(await sql('select inet_server_addr()::text;'), /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/);
  assert.equal(await sql("select count(*) from pg_tables where schemaname in ('public','auth');"),'0','DB_MUST_BE_EMPTY');
  owned=true;await sql(source('scripts/ci/payment-session-guard-schema.sql'));
  // Fixture DDL only, not replaying a historical migration or its data updates.
  const baseline=source('supabase/migrations/20260623_payment_provider_core.sql');
  const table=baseline.match(/create table if not exists public\.payment_sessions \([\s\S]*?\n\);/i)?.[0];assert.ok(table);
  const indexes=baseline.match(/create unique index if not exists payment_sessions_(?:session_no|active_business|provider_order|provider_transaction)_unique[\s\S]*?;/gi);assert.equal(indexes.length,4);
  await sql(table+'\n'+indexes.join('\n'));
  const old=source('supabase/migrations/20260623_payment_core_linkage.sql');
  const fn=old.match(/create or replace function public\.reserve_payment_session\([\s\S]*?\n\$\$;/i)?.[0];assert.ok(fn);await sql(fn);
  await sql(`insert into auth.users values (${literal(uid)});insert into public.profiles values (${literal(uid)},29);`);
  let data=await reset();await insert('payment_sessions',failedRow(data));await insert('payment_sessions',failedRow(data));
  const history=await read('payment_sessions'),before=await funds();
  await sql(source('supabase/migrations/20261007140629_payment_session_failed_retry_guard_v1.sql'));
  assert.deepEqual(await read('payment_sessions'),history);assert.equal((await reserve(args(data))).blockCode,'SESSION_FAILED_REQUIRES_REVIEW');
  assert.equal(await funds(),before);console.log('HISTORICAL_DUPLICATE_FAILED_ROWS_MIGRATION_PASS=yes');
  assert.equal(await sql("select has_function_privilege('anon','public.reserve_payment_session(text,text,uuid,text,uuid,text,text,text,text,numeric,numeric,numeric,timestamptz)','EXECUTE');"),'f');
  assert.equal(await sql("select has_function_privilege('authenticated','public.reserve_payment_session(text,text,uuid,text,uuid,text,text,text,text,numeric,numeric,numeric,timestamptz)','EXECUTE');"),'f');
  await assert.rejects(sql(`select public.reserve_payment_session(${argumentNames.map(k=>literal(args(data)['p_'+k])).join(',')});`));
  for(const provider of ['snpay','liuhaoyi']) for(const channel of ['alipay','wechat']) for(const expired of [false,true]) for(const present of [false,true]) {
    data=await reset(provider,channel);await insert('payment_sessions',failedRow(data,{expires_at:new Date(Date.now()+(expired?-60000:900000)).toISOString(),provider_order_no:present?'CI_ORDER':null}));
    const snapshot=await read('payment_sessions');const result=await reserve(args(data));assert.equal(result.blockCode,'SESSION_FAILED_REQUIRES_REVIEW');assert.equal(result.created,false);assert.equal(result.retryGuardVersion,1);
    assert.deepEqual(await read('payment_sessions'),snapshot);assert.equal(await funds(),before);
  }
  for(const status of ['succeeded','paid']) {data=await reset();await write('account_recharges','update',{status},data.account_recharges);assert.equal((await reserve(args(data))).blockCode,'BUSINESS_ALREADY_PAID');assert.equal((await read('payment_sessions')).length,0);}
  for(const field of ['p_provider','p_channel_code','p_user_id','p_business_no']) {data=await reset();const a=args(data);a[field]=field==='p_user_id'?randomUUID():'mismatch';assert.equal((await reserve(a)).blockCode,'SESSION_IDENTITY_CONFLICT');assert.equal((await read('payment_sessions')).length,0);}
  data=await reset();const alias=args(data);alias.p_business_type='account_recharge';assert.equal((await reserve(alias)).session.business_type,'recharge');
  const reused=await reserve(args(data));assert.equal(reused.created,false);assert.equal((await read('payment_sessions')).length,1);
  data=await reset();await insert('payment_sessions',failedRow(data,{status:'pending',expires_at:new Date(Date.now()-60000).toISOString()}));
  await insert('payment_sessions',failedRow(data));const staleWithFailed=await read('payment_sessions');
  assert.equal((await reserve(args(data))).blockCode,'SESSION_FAILED_REQUIRES_REVIEW');
  assert.deepEqual(await read('payment_sessions'),staleWithFailed,'blocked reservation must not expire or mutate history');
  data=await reset();await insert('payment_sessions',failedRow(data,{status:'pending',expires_at:new Date(Date.now()-60000).toISOString()}));
  assert.equal((await reserve(args(data))).created,true);
  assert.equal((await read('payment_sessions')).filter(r=>r.status==='expired').length,1,'legacy active expiry retained');
  data=await reset();await insert('payment_sessions',failedRow(data,{business_type:'order'}));
  const ordinary=args(data);ordinary.p_business_type='order';assert.equal((await reserve(ordinary)).created,true,'order retry unchanged');
  data=await reset('manual','usdt_bep20');await insert('payment_sessions',failedRow(data));
  assert.equal((await reserve(args(data))).created,true,'BEP20 external gateway guard not applied');
  for(let round=0;round<10;round++) {
    data=await reset(round%2?'liuhaoyi':'snpay');const ready=deferred(),go=deferred();
    const b=harness({data,backend,beforeReserve:async()=>{ready.resolve();await go.promise;}});
    const result=b.create().then(()=>{throw Error('UNEXPECTED_B_SUCCESS');},e=>e);await ready.promise;
    const a=harness({data,backend,providerCreate:async()=>{throw Error('TEST_UNCERTAIN_CREATE');}});
    await assert.rejects(a.create());go.resolve();assert.equal((await result).code,'SESSION_FAILED_REQUIRES_REVIEW');
    assert.equal(a.stats.provider,1);assert.equal(b.stats.provider,0);
    const rows=await read('payment_sessions');assert.equal(rows.length,1);assert.equal(rows[0].status,'failed');assert.equal(await funds(),before);
  }
  console.log('TOCTOU_FAILED_AFTER_PRECHECK_REAL_DB_PASS=yes,rounds=10');
  for(let round=0;round<10;round++) {
    data=await reset(round%2?'liuhaoyi':'snpay');const a=harness({data,backend}),b=harness({data,backend});
    const [x,y]=await Promise.all([a.create(),b.create()]);assert.equal(x.sessionNo,y.sessionNo);assert.equal(a.stats.provider+b.stats.provider,1);
    assert.equal((await read('payment_sessions')).length,1);assert.equal(await funds(),before);
  }
  console.log('CONCURRENT_CREATE_SINGLE_PROVIDER_REAL_DB_PASS=yes,rounds=10');
  console.log('REAL_DB_FAILED_GUARD_PASS=yes');
} finally {
  if(owned) {
    assert.equal(await sql('select identity from public.guard_ci_identity;'),'payment-session-guard-ci-only');
    await sql('drop schema public cascade;drop schema auth cascade;create schema public;drop role anon;drop role authenticated;drop role service_role;');
    console.log('CI_DB_CLEANUP_PASS=yes');
  }
}
