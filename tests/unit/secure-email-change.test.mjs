import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadPureTypeScript } from '../helpers/load-pure-typescript.mjs';
const core=loadPureTypeScript(new URL('../../lib/auth/secure-email-change.ts',import.meta.url));
const identity={id:'11111111-1111-4111-8111-111111111111',email:'old@example.invalid'};
const address='new@example.invalid';
function fixture(options={}){
 let user={...identity,email_confirmed_at:'2026-11-01T00:00:00Z'},current=false,next=false;
 const stats={update:0,verify:[],signout:[],reads:0};
 const client={auth:{
  async getUser(){stats.reads++;return{data:{user:{...user,...(options.readOverride??{})}},error:options.readError??null}},
  async updateUser({email}){stats.update++;user.new_email=email;if(options.autoConfirm){user.email=email;delete user.new_email}return{data:{user:options.updateOther?{...user,id:'other'}:{...user}},error:options.updateError??null}},
  async verifyOtp(params){stats.verify.push({...params,token:'REDACTED'});assert.equal(params.type,'email_change');if(options.otpError)return{data:{},error:options.otpError};if(params.email===identity.email&&params.token==='111111')current=true;else if(params.email===address&&params.token==='222222')next=true;else return{data:{},error:{code:'otp_expired',message:'SYNTHETIC-PRIVATE-DETAIL'}};
   if(current&&next){user.email=address;delete user.new_email;const verified={...user,id:options.verifyOther?'other':user.id};return{data:{user:verified,session:{user:verified}},error:null}}return{data:{user:null,session:null},error:null}},
  async signOut(args){stats.signout.push(args);return{error:null}},
 },from(){const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:options.missingProfile?null:{account_status:options.disabled?'disabled':'active',risk_status:options.blocked?'blocked':'normal'},error:null})};return q}};
 return{client,stats,user:()=>({...user}),switchIdentity(){user.id='other'}};
}
test('both old and new OTP required, same identity and old address retained after first proof',async()=>{
 const f=fixture();await core.beginSecureEmailChange(f.client,identity,address,true);
 const first=await core.verifySecureEmailChange(f.client,identity,address,'current','111111');assert.equal(first.complete,false);assert.equal(first.user.email,identity.email);
 const second=await core.verifySecureEmailChange(f.client,identity,address,'new','222222');assert.equal(second.complete,true);assert.equal(second.user.id,identity.id);assert.equal(second.user.email,address);
 assert.deepEqual(f.stats.verify.map(x=>x.email),[identity.email,address]);assert.equal(f.stats.update,1);
});
test('new-first is only partial; refreshed controller can finish old proof without trusting client flags',async()=>{
 const f=fixture();await core.beginSecureEmailChange(f.client,identity,address,true);
 assert.equal((await core.verifySecureEmailChange(f.client,identity,address,'new','222222')).complete,false);
 assert.equal(f.user().email,identity.email);
 assert.equal((await core.verifySecureEmailChange(f.client,identity,address,'current','111111')).complete,true);
});
for(const [name,opts] of [['disabled',{disabled:true}],['blocked',{blocked:true}],['missing profile',{missingProfile:true}],['identity drift',{readOverride:{id:'other'}}],['unconfirmed',{readOverride:{email_confirmed_at:null}}],['first-bind identity',{readOverride:{email:undefined}}]])test(name+' fails before email mutation',async()=>{
 const f=fixture(opts);await assert.rejects(core.beginSecureEmailChange(f.client,identity,address,true));assert.equal(f.stats.update,0);
});
test('default feature gate, same email and malformed addresses fail without network mutation',async()=>{
 for(const [email,enabled] of [[address,false],[identity.email.toUpperCase(),true],['bad',true]]){const f=fixture();await assert.rejects(core.beginSecureEmailChange(f.client,identity,email,enabled));assert.equal(f.stats.update,0)}
});
test('send is never completion and unsafe auto-confirm is rejected',async()=>{
 const f=fixture({autoConfirm:true});await assert.rejects(core.beginSecureEmailChange(f.client,identity,address,true),e=>e.code==='SECURE_CONFIRMATION_REQUIRED');
});
test('wrong, expired, replayed and side-swapped codes cannot complete',async()=>{
 const f=fixture();await core.beginSecureEmailChange(f.client,identity,address,true);
 for(const [side,code] of [['current','000000'],['current','222222'],['new','111111']])await assert.rejects(core.verifySecureEmailChange(f.client,identity,address,side,code));
 assert.equal(f.user().email,identity.email);
 await core.verifySecureEmailChange(f.client,identity,address,'current','111111');
 const expired=fixture({otpError:{code:'otp_expired'}});await core.beginSecureEmailChange(expired.client,identity,address,true);await assert.rejects(core.verifySecureEmailChange(expired.client,identity,address,'new','222222'));
 await core.verifySecureEmailChange(f.client,identity,address,'new','222222');await assert.rejects(core.verifySecureEmailChange(f.client,identity,address,'new','222222'));
});
test('account switch and pending-address replacement reject before verify request',async()=>{
 const f=fixture();await core.beginSecureEmailChange(f.client,identity,address,true);f.switchIdentity();await assert.rejects(core.verifySecureEmailChange(f.client,identity,address,'current','111111'));assert.equal(f.stats.verify.length,0);
 const g=fixture();await core.beginSecureEmailChange(g.client,identity,address,true);await assert.rejects(core.verifySecureEmailChange(g.client,identity,'different@example.invalid','new','222222'));assert.equal(g.stats.verify.length,0);
});
test('returned foreign session is signed out locally, never accepted',async()=>{
 const f=fixture({verifyOther:true});await core.beginSecureEmailChange(f.client,identity,address,true);await core.verifySecureEmailChange(f.client,identity,address,'current','111111');await assert.rejects(core.verifySecureEmailChange(f.client,identity,address,'new','222222'));assert.deepEqual(f.stats.signout,[{scope:'local'}]);
});
test('safe errors never reflect provider private details',()=>{
 for(const code of ['otp_expired','over_email_send_rate_limit','email_exists','unknown']){const text=core.emailChangeErrorMessage({code,message:'SYNTHETIC-PRIVATE-DETAIL',token:'SYNTHETIC-SECRET'});assert.doesNotMatch(text,/SYNTHETIC|DETAIL|SECRET/)}
});
test('UI is embedded/collapsed, uses in-flight lock and cooldown, never persists OTP or starts login OTP',()=>{
 const page=readFileSync(new URL('../../app/account/security/page.tsx',import.meta.url),'utf8');assert.match(page,/<BoundEmailChange/);assert.match(page,/邮箱安全/);assert.match(page,/登录密码/);
 const source=readFileSync(new URL('../../components/auth/BoundEmailChange.tsx',import.meta.url),'utf8');assert.match(source,/useState\(false\)/);assert.match(source,/aria-expanded=\{open\}/);assert.match(source,/inFlight\.current = true/);assert.match(source,/Date\.now\(\) < nextSend/);assert.match(source,/sessionStorage\.setItem\(storageKey, String\(until\)\)/);assert.doesNotMatch(source,/signInWithOtp|localStorage|console\./);
});
