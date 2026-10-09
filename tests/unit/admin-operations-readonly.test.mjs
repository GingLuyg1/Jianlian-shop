import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readOperationsList, operationsFilters, safeWorkerState } from '../../lib/admin/operations-readonly.mjs';
import { loadTs } from '../helpers/payment-session-guard-harness.mjs';
import { observeWorker } from '../../scripts/ops/publish-operations-worker-status.mjs';

function client(data = {}, fail = false) {
  const calls=[];
  return { calls, from(table) {
    let filters=[],range=null,limit=null;
    const q={ select(columns,opts){calls.push(['select',table,columns,opts]);return q;},
      eq(k,v){calls.push(['eq',k,v]);filters.push(r=>r[k]===v);return q;},
      in(k,v){calls.push(['in',k,v]);filters.push(r=>v.includes(r[k]));return q;},
      gte(k,v){calls.push(['gte',k,v]);filters.push(r=>String(r[k])>=v);return q;},
      lte(k,v){calls.push(['lte',k,v]);filters.push(r=>String(r[k])<=v);return q;},
      or(v){calls.push(['or',v]);return q;},ilike(k,v){calls.push(['ilike',k,v]);return q;},
      order(k,v){calls.push(['order',k,v]);return q;},range(a,b){range=[a,b];calls.push(['range',a,b]);return q;},limit(n){limit=n;return q;},
      then(resolve,reject){const all=(data[table]??[]).filter(r=>filters.every(f=>f(r)));const rows=range?all.slice(range[0],range[1]+1):limit?all.slice(0,limit):all;
        return Promise.resolve({data:rows,count:all.length,error:fail?{message:'SECRET_DATABASE_ERROR'}:null}).then(resolve,reject);},
      insert(){throw Error('WRITE_FORBIDDEN');},update(){throw Error('WRITE_FORBIDDEN');},delete(){throw Error('WRITE_FORBIDDEN');},upsert(){throw Error('WRITE_FORBIDDEN');},
    };return q;
  }};
}
test('ledger page two retrieves full history with exact count and deterministic order', async()=>{
  const c=client({balance_transactions:Array.from({length:121},(_,i)=>({id:String(i),user_id:'u',status:'completed'})),profiles:[{id:'u',email:'synthetic@example.invalid'}]});
  const r=await readOperationsList(c,'ledger',new URLSearchParams('page=2&status=completed'));
  assert.equal(r.rows.length,50);assert.equal(r.rows[0].id,'50');assert.equal(r.total,121);assert.equal(r.rows[0].user_email,'synthetic@example.invalid');
  assert.deepEqual(c.calls.filter(c=>c[0]==='range'),[['range',50,99]]);
  assert.deepEqual(c.calls.filter(c=>c[0]==='order').map(c=>c[1]),['created_at','id']);
  assert.doesNotMatch(c.calls.find(c=>c[1]==='balance_transactions')[2],/metadata|remark/);
});
test('queue aliases use actual uppercase backend states and separate retryable failures',async()=>{
  for(const [status,retryable] of [['retryable_failed',true],['permanent_failed',false]]){
    const c=client({supplier_fulfillment_requests:[{id:'a',status:'FAILED',retryable,last_error_code:'A_VALID_CODE'},{id:'b',status:'FAILED',retryable:!retryable}]});
    const r=await readOperationsList(c,'supplier-queue',new URLSearchParams({status}));assert.equal(r.rows.length,1);assert.equal(r.rows[0].id,'a');
  }
  const c=client();await readOperationsList(c,'supplier-queue',new URLSearchParams('status=completed'));
  assert.deepEqual(c.calls.find(c=>c[0]==='in'),['in','status',['FULFILLED']]);
  assert.doesNotMatch(c.calls.find(c=>c[1]==='supplier_fulfillment_requests')[2],/attempt_token|delivery_content|price/);
});
test('list filters reject injection, invalid dates/ranges and excessive search matches',async()=>{
  for(const s of ['q=a,b','q=(x)','status=x.y','start=2026-02-30','start=2026-10-10&end=2026-10-09','min_amount=-1','min_amount=3&max_amount=2'])assert.throws(()=>operationsFilters(new URLSearchParams(s)));
  await assert.rejects(readOperationsList(client({profiles:Array.from({length:51},()=>({id:'x'}))}),'ledger',new URLSearchParams('q=example')),/匹配用户过多/);
});
test('empty and read error results never masquerade as writes or success',async()=>{
  assert.equal((await readOperationsList(client(),'ledger',new URLSearchParams())).total,0);
  await assert.rejects(readOperationsList(client({},true),'ledger',new URLSearchParams()),/OPERATIONS_READ_FAILED/);
});
test('worker output allowlist redacts secrets and never infers timer state',()=>{
  const now=Date.parse('2026-10-10T00:00:00Z');
  const w=safeWorkerState({status:'finished',finished_at:new Date(now).toISOString(),secret:'never',scan_cursor:{id:'never'},provider_queries:3},null,now);
  assert.equal(w.timer_enabled,'unknown');assert.equal(w.timer_active,'unknown');assert.equal(w.heartbeat_stale,false);assert.doesNotMatch(JSON.stringify(w),/never|scan_cursor/);
  const s=safeWorkerState(null,{timer_enabled:true,timer_active:true,observed_at:new Date(now-121000).toISOString()},now);
  assert.equal(s.timer_active,'unknown');assert.equal(s.heartbeat_stale,true);
  const fresh=safeWorkerState(null,{timer_enabled:true,timer_active:false,observed_at:new Date(now).toISOString(),invocation_id:'a'.repeat(32)},now);
  assert.equal(fresh.timer_enabled,true);assert.equal(fresh.last_invocation,'a'.repeat(32));
});
test('host snapshot publisher only invokes allowlisted read-only systemd commands',()=>{
  const calls=[];
  const state=observeWorker((command,args)=>{calls.push([command,args]);return {stdout:args[0]==='is-enabled'?'enabled':args[0]==='is-active'?'active':'b'.repeat(32)};});
  assert.equal(state.timer_active,true);assert.equal(state.timer_enabled,true);
  assert.deepEqual(calls.map(c=>c[1][0]),['is-enabled','is-active','show']);
  assert.ok(calls.every(c=>c[0]==='/usr/bin/systemctl'));
});
test('unauthorized operations requests do not touch files, service role or network',async()=>{
  const denied=()=>({ok:false,response:Response.json({error:'denied'},{status:403})});
  let reads=0;
  const route=loadTs('app/api/admin/operations/[workspace]/route.ts',{
    'next/server':{NextResponse:{json:Response.json}},'node:fs/promises':{open(){reads++;throw Error('FORBIDDEN');}},
    '@/lib/admin/api-auth':{requireApiAdmin:denied,requireApiSuperAdmin:denied},
    '@/lib/supabase/service-role':{getSupabaseServiceRoleClient(){reads++;throw Error('FORBIDDEN');}},
    '@/lib/admin/operations-readonly.mjs':{readOperationsList,operationsFilters,safeWorkerState},
  });
  for(const workspace of ['worker','ledger','supplier-queue'])assert.equal((await route.GET(new Request('https://local.test'),{params:{workspace}})).status,403);
  assert.equal(reads,0);
});
test('readonly workspaces expose only GET and no operational execution control',()=>{
  const api=readFileSync(new URL('../../app/api/admin/operations/[workspace]/route.ts',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../../components/admin/OperationsReadonlyWorkspace.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(api,/export async function (POST|PATCH|PUT|DELETE)|child_process|execSync|spawn|\.rpc\(/);
  assert.match(api,/kind === 'ledger' \? await requireApiSuperAdmin/);
  assert.doesNotMatch(ui,/method:\s*['"](?:POST|PATCH|PUT|DELETE)|force.complete|retry.fulfillment/);
  assert.match(ui,/controller.abort\(\)/);assert.match(ui,/暂无记录/);assert.match(ui,/role="alert"/);assert.match(ui,/overflow|AdminTableViewport/);
  assert.match(ui,/\/admin\/orders\?search=\$\{encodeURIComponent/);
  assert.doesNotMatch(ui,/\/admin\/orders\/\$\{/);
});
