import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTs } from '../helpers/payment-session-guard-harness.mjs';
const uid='00000000-0000-4000-8000-000000000001';
function fixture({existing=null,authorized=true,serviceAvailable=true,duplicate=false}={}) {
  const writes=[];
  let reads=0;
  const session={auth:{getUser:async()=>({data:{user:authorized?{id:uid,email:'verified@example.invalid'}:null},error:null})},
    from(){const q={select(){return q;},eq(k,v){assert.equal(k,'id');assert.equal(v,uid);return q;},maybeSingle:async()=>({data:duplicate && reads++ === 0 ? null : existing,error:null}),insert(){throw Error('AUTHENTICATED_INSERT_FORBIDDEN');}};return q;}};
  const service={from(table){assert.equal(table,'profiles');let payload;const q={insert(v){payload=v;writes.push(v);return q;},select(){return q;},maybeSingle:async()=>({data:duplicate?null:payload,error:duplicate?{code:'23505'}:null})};return q;}};
  const route=loadTs('app/api/account/profile/route.ts',{
    'next/server':{NextResponse:{json:Response.json}},'@/lib/admin/audit-log-service':{getAuditErrorMessage:()=>''},
    '@/lib/supabase/server':{getSupabaseServerClient:()=>session,hasSupabaseServerConfig:()=>true},
    '@/lib/users/account-guard':{},'@/lib/supabase/service-role':{getSupabaseServiceRoleClient:()=>serviceAvailable?service:null},
  });return {route,writes,session};
}
test('server missing-profile repair uses verified identity and fixed defaults, never body claims',async()=>{
  const f=fixture();const r=await f.route.POST(new Request('https://local.test',{method:'POST',body:JSON.stringify({id:'other',role:'admin',balance:999999,invite_code:'evil',referred_by:'evil'})}));
  assert.equal(r.status,200);assert.deepEqual(f.writes,[{id:uid,email:'verified@example.invalid',phone:null,role:'user',balance:0,promotion_balance:0}]);
});
test('unauthorized, existing profile and missing service credentials never insert',async()=>{
  for(const config of [{authorized:false},{existing:{id:uid,role:'user'}},{serviceAvailable:false}]){
    const f=fixture(config);const r=await f.route.POST();assert.equal(f.writes.length,0);assert.equal(r.status,config.authorized===false?401:config.serviceAvailable===false?500:200);
  }
});
test('concurrent server bootstrap unique conflict rereads without upsert or overwrite',async()=>{
  const f=fixture({duplicate:true,existing:{id:uid,role:'user',balance:12}});
  const r=await f.route.POST();assert.equal(r.status,200);assert.equal((await r.json()).profile.balance,12);assert.equal(f.writes.length,1);
});
test('browser bootstrap is body-free, authenticated, identity-checked and financial fallback stays zero',async()=>{
  const f=fixture();const calls=[];
  const profiles=loadTs('lib/supabase/profiles.ts',{},undefined,{fetch:async(url,init)=>{calls.push({url,init});return Response.json({profile:{id:uid,role:'user',balance:0,promotion_balance:0}});}});
  const p=await profiles.getOrCreateProfile(f.session,{id:uid,email:'synthetic@example.invalid'});
  assert.equal(p.balance,0);assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/account/profile');assert.equal(calls[0].init.method,'POST');assert.equal(calls[0].init.body,undefined);
  const wrong=loadTs('lib/supabase/profiles.ts',{},undefined,{fetch:async()=>Response.json({profile:{id:'other',role:'admin',balance:999999}})});
  const fallback=await wrong.getOrCreateProfile(f.session,{id:uid});assert.equal(fallback.role,'user');assert.equal(fallback.balance,0);
});
test('forward-only ACL migration revokes table and column INSERT without touching business rows',()=>{
  const m=readFileSync(new URL('../../supabase/migrations/20261009170042_profiles_insert_privilege_hardening.sql',import.meta.url),'utf8');
  assert.match(m,/begin;/i);assert.match(m,/commit;/i);assert.match(m,/revoke insert on public.profiles from public, anon, authenticated/i);
  assert.match(m,/revoke insert \(%s\)/i);assert.match(m,/has_any_column_privilege/);assert.match(m,/PROFILE_SIGNUP_TRIGGER_BASELINE_INVALID/);
  assert.doesNotMatch(m,/\b(?:insert into|update public|delete from|alter table|create or replace function)\b/i);
});
