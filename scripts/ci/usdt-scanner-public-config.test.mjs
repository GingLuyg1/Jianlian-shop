import test from 'node:test';
import assert from 'node:assert/strict';
import {sha,validateConfig,extractConfig,publicScriptURLs,diagnosePublicAssets,diagnoseScriptDiscovery} from './usdt-scanner-public-config.mjs';
const c={NEXT_PUBLIC_SUPABASE_URL:'https://testref.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'sb_publishable_synthetic_public_value_only'};
const pins={projectRef:'testref',sha256:Object.fromEntries(Object.entries(c).map(([n,v])=>[n,sha(v)]))};
test('only exact public URL and publishable key digest accepted',()=>assert.deepEqual(validateConfig(c,pins),c));
test('unknown extra field cannot transport a server secret',()=>assert.throws(()=>validateConfig({...c,SUPABASE_SECRET_KEY:'synthetic-forbidden'},pins),/KEYS_REJECTED/));
test('service secret is rejected even when deliberately digest-pinned',()=>{const v={...c,NEXT_PUBLIC_SUPABASE_ANON_KEY:'sb_secret_synthetic_forbidden'};assert.throws(()=>validateConfig(v,{...pins,sha256:Object.fromEntries(Object.entries(v).map(([n,x])=>[n,sha(x)]))}),/KEY_TYPE_REJECTED/);});
test('cross-project URL is rejected even when digest-pinned',()=>{const v={...c,NEXT_PUBLIC_SUPABASE_URL:'https://wrong.supabase.co'};assert.throws(()=>validateConfig(v,{...pins,sha256:Object.fromEntries(Object.entries(v).map(([n,x])=>[n,sha(x)]))}),/PROJECT_MISMATCH/);});
test('public extraction does not accept a similar but different key',()=>assert.throws(()=>extractConfig([c.NEXT_PUBLIC_SUPABASE_URL,c.NEXT_PUBLIC_SUPABASE_ANON_KEY+'x'],pins),/KEY_NOT_FOUND/));
test('public extraction accepts existing approved browser value without credentials',()=>assert.deepEqual(extractConfig([JSON.stringify(c)],pins),c));
test('only same-origin static scripts are eligible',()=>assert.deepEqual(publicScriptURLs('<script src="/_next/static/chunks/a.js"></script><script src="https://evil.invalid/a.js"></script><script src="/api/customer.js"></script>','https://safe.invalid'),['https://safe.invalid/_next/static/chunks/a.js']));
test('credential-bearing and query-bearing URLs never enter fetch list',()=>assert.throws(()=>publicScriptURLs('<script src="https://a:b@safe.invalid/_next/static/a.js"></script><script src="/_next/static/a.js?token=x"></script>','https://safe.invalid'),/SCRIPT_SET_REJECTED/));
test('encoded traversal is rejected',()=>assert.throws(()=>publicScriptURLs('<script src="/_next/static/%2e%2e/%2e%2e/a.js"></script>','https://safe.invalid'),/SCRIPT_SET_REJECTED/));
test('public diagnostics distinguish missing, different and format-incompatible keys without raw values',()=>{
  const long='sb_publishable_'+ 'a'.repeat(201);
  const data=diagnosePublicAssets([{asset:'/login',text:'no public config'},
    {asset:'/a.js',text:JSON.stringify(c)}, {asset:'/b.js',text:long}],pins);
  assert.equal(data[0].publishableCandidates.length,0);
  assert.equal(data[1].expectedProjectURLPresent,true);
  assert.equal(data[1].publishableCandidates[0].pinnedHashMatch,true);
  assert.equal(data[2].publishableCandidates[0].pinnedHashMatch,false);
  assert.equal(data[2].publishableCandidates[0].currentFormatAccepted,false);
  assert.equal(JSON.stringify(data).includes(c.NEXT_PUBLIC_SUPABASE_ANON_KEY),false);
  assert.equal(JSON.stringify(data).includes(long),false);
});
test('public diagnostics count legacy roles without recording JWTs or secret values',()=>{
  const jwt=r=>'eyJhbGciOiJub25lIn0.'+Buffer.from(JSON.stringify({role:r})).toString('base64url')+'.synthetic_signature';
  const secret='sb_secret_synthetic_never_print';
  const t=[jwt('anon'),jwt('service_role'),secret].join(' ');
  const data=diagnosePublicAssets([{asset:'/a.js',text:t}],pins);
  assert.deepEqual(data[0].legacyJWTRoleCounts,{anon:1,service_role:1,other:0});
  assert.equal(data[0].secretKeyMarkerPresent,true);
  for(const value of t.split(' '))assert.equal(JSON.stringify(data).includes(value),false);
});
test('discovery evidence identifies excluded script paths but never query values or credentials',()=>{
  const html='<script src="/_next/static/a.js"></script><script src="/_next/static/app.js?dpl=do-not-record"></script><script src="https://a:b@other.invalid/x.js"></script>';
  const d=diagnoseScriptDiscovery(html,'https://safe.invalid');
  assert.equal(d[0].accepted,true);assert.equal(d[1].accepted,false);
  assert.deepEqual(d[1].queryNames,['dpl']);assert.equal(d[2].hasCredentials,true);
  assert.equal(JSON.stringify(d).includes('do-not-record'),false);
  assert.equal(JSON.stringify(d).includes('a:b'),false);
});
