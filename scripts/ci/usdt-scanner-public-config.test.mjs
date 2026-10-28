import test from 'node:test';
import assert from 'node:assert/strict';
import {sha,validateConfig,extractConfig,publicScriptURLs,diagnosePublicAssets,diagnoseScriptDiscovery,validatePublicAssets,fetchVerifiedPublicConfig} from './usdt-scanner-public-config.mjs';
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
test('App Router Flight chunk references are parsed as inert JSON and keep the same-origin scope',()=>{
  const flight='1:I[42,["100","static/chunks/app/login/page-approved.js"],"default"]\n';
  const html='<script src="/_next/static/chunks/main.js"></script><script>self.__next_f.push('+JSON.stringify([1,flight])+')</script>';
  assert.deepEqual(publicScriptURLs(html,'https://safe.invalid'),[
    'https://safe.invalid/_next/static/chunks/main.js',
    'https://safe.invalid/_next/static/chunks/app/login/page-approved.js']);
});
test('Flight extraction does not evaluate code or accept remote or query-bearing chunk references',()=>{
  const data='["https://evil.invalid/static/chunks/remote.js","static/chunks/a.js?token=not-allowed"]';
  const html='<script src="/_next/static/main.js"></script><script>self.__next_f.push('+JSON.stringify([1,data])+')</script><script>self.__next_f.push((globalThis.executed=true,[]))</script>';
  assert.deepEqual(publicScriptURLs(html,'https://safe.invalid'),['https://safe.invalid/_next/static/main.js']);
  assert.equal(globalThis.executed,undefined);
});
test('Flight paths cannot normalize raw or encoded traversal into an allowed resource',()=>{
  for(const ref of ['static/chunks/../a.js','static/chunks/%2e%2e/a.js']){
    const html='<script src="/_next/static/main.js"></script><script>self.__next_f.push('+JSON.stringify([1,JSON.stringify([ref])])+')</script>';
    assert.throws(()=>publicScriptURLs(html,'https://safe.invalid'),/FLIGHT_PATH_REJECTED/);
  }
});
test('Flight chunk discovery retains the total 40-resource hard limit',()=>{
  const data=JSON.stringify(Array.from({length:41},(_,i)=>'static/chunks/'+i+'.js'));
  assert.throws(()=>publicScriptURLs('<script>self.__next_f.push('+JSON.stringify([1,data])+')</script>','https://safe.invalid'),/SCRIPT_SET_REJECTED/);
});

// Unit fixtures only. Real build --fetch always uses the committed real asset
// digest and the unchanged Production public-config pins, not these test values.
const assetBytes=Buffer.from(JSON.stringify(c));
const assetPins={...pins,productionBaseSHA:'1'.repeat(40),publicOrigin:'https://safe.invalid'};
const manifest={productionBaseSHA:assetPins.productionBaseSHA,assets:[{path:'/_next/static/chunks/approved.js',sha256:sha(assetBytes)}]};
test('exact file and original config pins authorize fetch without any login-page request',async()=>{
  const requests=[];
  const r=await fetchVerifiedPublicConfig(manifest,assetPins,async(u,max)=>{requests.push(u);assert.equal(max,8*1024*1024);return assetBytes;});
  assert.deepEqual(r.config,c);assert.deepEqual(requests,['https://safe.invalid/_next/static/chunks/approved.js']);
  assert.equal(r.provenance.assets[0].fileDigestMatch,true);assert.equal(r.provenance.loginPageRequired,false);
  assert.equal(JSON.stringify(r.provenance).includes(c.NEXT_PUBLIC_SUPABASE_ANON_KEY),false);
});
test('changed file bytes fail before configuration extraction even if they contain approved values',async()=>{
  await assert.rejects(fetchVerifiedPublicConfig(manifest,assetPins,async()=>Buffer.concat([assetBytes,Buffer.from(' ')])),/ASSET_DIGEST_MISMATCH/);
});
test('file hash cannot override a different project or public-key fingerprint',async()=>{
  const bad=Buffer.from(JSON.stringify({...c,NEXT_PUBLIC_SUPABASE_ANON_KEY:c.NEXT_PUBLIC_SUPABASE_ANON_KEY+'x'}));
  await assert.rejects(fetchVerifiedPublicConfig({...manifest,assets:[{...manifest.assets[0],sha256:sha(bad)}]},assetPins,async()=>bad),/PINNED_PUBLIC_KEY_NOT_FOUND/);
  const wrong=Buffer.from(JSON.stringify({...c,NEXT_PUBLIC_SUPABASE_URL:'https://wrong.supabase.co'}));
  await assert.rejects(fetchVerifiedPublicConfig({...manifest,assets:[{...manifest.assets[0],sha256:sha(wrong)}]},assetPins,async()=>wrong),/PINNED_PUBLIC_URL_NOT_FOUND/);
});
test('manifest rejects other releases, secret fields, invalid digests and duplicate paths',()=>{
  for(const m of [{...manifest,productionBaseSHA:'2'.repeat(40)},{...manifest,secret:'forbidden'},
    {...manifest,assets:[{...manifest.assets[0],sha256:'abc'}]},
    {...manifest,assets:[manifest.assets[0],manifest.assets[0]]}])assert.throws(()=>validatePublicAssets(m,assetPins),/MANIFEST_REJECTED/);
});
test('manifest permits only canonical same-origin static JS paths without normalization',()=>{
  for(const p of ['https://evil.invalid/_next/static/chunks/a.js','//evil.invalid/a.js','/api/private.js',
    '/_next/static/chunks/a.js?token=x','/_next/static/chunks/a.js#x','/_next/static/chunks/../a.js',
    '/_next/static/chunks/%2e%2e/a.js','/_next/static/chunks//a.js'])
    assert.throws(()=>validatePublicAssets({...manifest,assets:[{...manifest.assets[0],path:p}]},assetPins),/MANIFEST_REJECTED/);
});
test('invalid manifest performs no request and read failures have no fallback or retry',async()=>{
  let calls=0;const read=async()=>{calls++;throw Error('PUBLIC_ASSET_TIMEOUT');};
  await assert.rejects(fetchVerifiedPublicConfig({...manifest,assets:[]},assetPins,read),/MANIFEST_REJECTED/);assert.equal(calls,0);
  await assert.rejects(fetchVerifiedPublicConfig(manifest,assetPins,read),/PUBLIC_ASSET_TIMEOUT/);assert.equal(calls,1);
});
test('manifest and returned-byte size retain hard resource limits',async()=>{
  assert.throws(()=>validatePublicAssets({...manifest,assets:Array.from({length:10},(_,i)=>({...manifest.assets[0],path:'/_next/static/chunks/'+i+'.js'}))},assetPins),/MANIFEST_REJECTED/);
  await assert.rejects(fetchVerifiedPublicConfig(manifest,assetPins,async()=>Buffer.alloc(8*1024*1024+1)),/ASSET_SIZE_LIMIT/);
});
