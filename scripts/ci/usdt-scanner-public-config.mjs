// No cloud credentials, privileged API, cookies, tokens or .env files are used.
// The approved publishable key is already shipped in the public site's JS.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setDefaultResultOrder } from 'node:dns';
setDefaultResultOrder('ipv4first');
export const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const pins = JSON.parse(fs.readFileSync(new URL('./usdt-scanner-public-config-pins.json',import.meta.url)));
const publicNames = [...Object.keys(pins.sha256),...pins.derivedBuildFields].sort();
const fail = code => { throw Error(code); };
export function validateConfig(c, expected=pins) {
  if(!c||Object.keys(c).sort().join('|')!==Object.keys(expected.sha256).sort().join('|'))fail('PUBLIC_CONFIG_KEYS_REJECTED');
  for(const [n,d] of Object.entries(expected.sha256))if(typeof c[n]!=='string'||sha(c[n])!==d)fail('PUBLIC_CONFIG_DIGEST_MISMATCH');
  if(c.NEXT_PUBLIC_SUPABASE_URL!==`https://${expected.projectRef}.supabase.co`)fail('PUBLIC_PROJECT_MISMATCH');
  if(!/^sb_publishable_[A-Za-z0-9_-]{15,200}$/.test(c.NEXT_PUBLIC_SUPABASE_ANON_KEY))fail('PUBLIC_KEY_TYPE_REJECTED');
  return c;
}
export function publicScriptURLs(html, origin=pins.publicOrigin) {
  const found=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)].map(m=>new URL(m[1],origin));
  const urls=[...new Set(found.filter(u=>u.origin===origin&&/^\/_next\/static\/[A-Za-z0-9_./()%+-]+\.js$/.test(u.pathname)&&!decodeURIComponent(u.pathname).split('/').includes('..')&&!u.username&&!u.password&&!u.search&&!u.hash).map(u=>u.href))];
  if(!urls.length||urls.length>40)fail('PUBLIC_SCRIPT_SET_REJECTED');return urls;
}
export function diagnoseScriptDiscovery(html, origin=pins.publicOrigin) {
  const accepted=new Set(publicScriptURLs(html,origin));
  return [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)].map(m=>{
    try{const u=new URL(m[1],origin);return {sameOrigin:u.origin===origin,
      staticPath:u.origin===origin&&u.pathname.startsWith('/_next/static/')?u.pathname:null,
      queryNames:[...u.searchParams.keys()],hasCredentials:!!(u.username||u.password),
      hasFragment:!!u.hash,accepted:accepted.has(u.href)};}catch{return {invalidURL:true};}
  });
}
export function extractConfig(texts, expected=pins) {
  const values=new Set(texts.flatMap(t=>[...t.matchAll(/sb_publishable_[A-Za-z0-9_-]{15,200}/g)].map(m=>m[0])));
  const key=[...values].filter(v=>sha(v)===expected.sha256.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if(key.length!==1)fail('PINNED_PUBLIC_KEY_NOT_FOUND');
  const url=`https://${expected.projectRef}.supabase.co`;
  if(!texts.some(t=>t.includes(url)))fail('PINNED_PUBLIC_URL_NOT_FOUND');
  return validateConfig({NEXT_PUBLIC_SUPABASE_URL:url,NEXT_PUBLIC_SUPABASE_ANON_KEY:key[0]},expected);
}
// Failure evidence contains only public asset identities and one-way summaries.
// It must never include raw configuration, JWTs, response snippets or headers.
export function diagnosePublicAssets(assets, expected=pins) {
  return assets.map(({asset,text})=>{
    const values=[...new Set([...text.matchAll(/sb_publishable_[A-Za-z0-9_-]+/g)].map(m=>m[0]))];
    const roles={anon:0,service_role:0,other:0};
    for(const m of text.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)){
      try{const r=JSON.parse(Buffer.from(m[0].split('.')[1],'base64url')).role;roles[r==='anon'||r==='service_role'?r:'other']++;}catch{}
    }
    return {asset,bytes:Buffer.byteLength(text),sha256:sha(text),
      expectedProjectURLPresent:text.includes(`https://${expected.projectRef}.supabase.co`),
      publishableCandidates:values.map(v=>({length:v.length,sha256:sha(v),
        pinnedHashMatch:sha(v)===expected.sha256.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        currentFormatAccepted:/^sb_publishable_[A-Za-z0-9_-]{15,200}$/.test(v)})),
      legacyJWTRoleCounts:roles,secretKeyMarkerPresent:/sb_secret_[A-Za-z0-9_-]+/.test(text)};
  });
}
async function boundedText(url, maximum) {
  let r;try{r=await fetch(url,{redirect:'error',credentials:'omit',headers:{'user-agent':'Jianlian-Public-Build-Config/1'},signal:AbortSignal.timeout(10000)});}catch(e){fail(e.name==='TimeoutError'||e.cause?.code==='UND_ERR_CONNECT_TIMEOUT'?'PUBLIC_ASSET_TIMEOUT':'PUBLIC_ASSET_NETWORK_FAILURE');}
  if(!r.ok||Number(r.headers.get('content-length')||0)>maximum)fail('PUBLIC_ASSET_READ_FAILED');
  if(!r.body)fail('PUBLIC_ASSET_BODY_MISSING');
  const reader=r.body.getReader();let count=0;const parts=[];
  for(;;){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>maximum){await reader.cancel();fail('PUBLIC_ASSET_SIZE_LIMIT');}parts.push(Buffer.from(value));}
  return Buffer.concat(parts).toString('utf8');
}
export function auditPublicReferences(root) {
  const found=new Set();
  function walk(dir){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isSymbolicLink())fail('SOURCE_LINK_REJECTED');const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(?:[cm]?js|tsx?)$/.test(e.name)){for(const m of fs.readFileSync(p,'utf8').matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g))found.add(m[0]);}}}
  for(const d of ['app','components','hooks','lib'])walk(path.join(root,d));
  if([...found].some(n=>!publicNames.includes(n)))fail('UNREVIEWED_NEXT_PUBLIC_REFERENCE');
  return [...found].sort();
}
function configAt(root){return validateConfig(JSON.parse(fs.readFileSync(path.join(root,'public-config.json'),'utf8')));}
function writeNew(p,v){fs.writeFileSync(p,JSON.stringify(v,null,2),{flag:'wx',mode:0o600});}
function auditBuild(root,c){
  let bytes=0,files=0;const hits=Object.fromEntries(Object.keys(c).map(n=>[n,0]));
  function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isSymbolicLink())fail('BUILD_LINK_REJECTED');const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(js|json|html|rsc)$/.test(e.name)){const b=fs.readFileSync(p);bytes+=b.length;files++;if(bytes>256*1024*1024)fail('BUILD_AUDIT_BUDGET');const t=b.toString('utf8');if(t.includes('build-only.invalid')||t.includes('synthetic-build-only')||/sb_secret_[A-Za-z0-9_-]{15,}/.test(t)||/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(t))fail('COMPILED_CONFIG_OR_SECRET_REJECTED');
   for(const n of Object.keys(c))if(b.includes(Buffer.from(c[n])))hits[n]++;
   for(const m of t.matchAll(/sb_publishable_[A-Za-z0-9_-]{15,200}/g))if(sha(m[0])!==pins.sha256.NEXT_PUBLIC_SUPABASE_ANON_KEY)fail('UNAPPROVED_PUBLIC_KEY_IN_BUILD');
   for(const m of t.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)){try{if(JSON.parse(Buffer.from(m[0].split('.')[1],'base64url')).role==='service_role')fail('PRIVILEGED_JWT_IN_BUILD');}catch(e){if(e.message==='PRIVILEGED_JWT_IN_BUILD')throw e;}}
  }}}
  walk(path.join(root,'source','.next'));if(Object.values(hits).some(n=>n===0))fail('PUBLIC_CONFIG_NOT_INLINED');
  return {files,bytes,publicValueFileMatches:hits,syntheticConfigRemoved:true,privilegedCredentialsDetected:false,serverSecretsProvided:false};
}
async function main(){
 const [mode,root]=process.argv.slice(2);if(!root||!fs.statSync(root).isDirectory()||fs.lstatSync(root).isSymbolicLink())fail('WORK_ROOT_REJECTED');
 if(mode==='--fetch'){
  const html=await boundedText(pins.publicOrigin+'/login',1024*1024),urls=publicScriptURLs(html),texts=[],assets=[{asset:'/login',text:html}];let bytes=0;
  for(const url of urls){const t=await boundedText(url,8*1024*1024);bytes+=Buffer.byteLength(t);if(bytes>48*1024*1024)fail('PUBLIC_FETCH_TOTAL_LIMIT');texts.push(t);assets.push({asset:new URL(url).pathname,text:t});}
  writeNew(path.join(root,'out','public-config-diagnostic.json'),{origin:pins.publicOrigin,scriptDiscovery:diagnoseScriptDiscovery(html),assets:diagnosePublicAssets(assets),rawValuesRecorded:false});
  const c=extractConfig(texts);writeNew(path.join(root,'public-config.json'),c);
  writeNew(path.join(root,'out','public-config-provenance.json'),{method:'UNAUTHENTICATED_PUBLIC_SITE_JS_MATCHED_TO_SSH_DIGESTS',origin:pins.publicOrigin,assetCount:urls.length,bytes,pinnedDigests:pins.sha256,keyType:pins.keyType,productionSecretsRead:false,productionDatabaseAccess:false});
 }else if(mode==='--build'){
  const c=configAt(root);auditPublicReferences(path.join(root,'source'));
  for(const n of Object.keys(process.env))if(n.startsWith('NEXT_PUBLIC_')||/^(SUPABASE.*(?:KEY|SECRET)|.*(?:API_KEY|SECRET|PASSWORD|TOKEN))$/.test(n))fail('UNEXPECTED_BUILD_ENVIRONMENT');
  if(!/^[a-f0-9]{40}$/.test(process.env.SOURCE_SHA||''))fail('SOURCE_SHA_REQUIRED');
  const meta={NEXT_PUBLIC_APP_VERSION:'scanner-order-v1',NEXT_PUBLIC_BUILD_TIME:new Date().toISOString(),NEXT_PUBLIC_COMMIT_SHA:process.env.SOURCE_SHA,NEXT_PUBLIC_GIT_BRANCH:process.env.ARTIFACT_KIND==='rollback'?'scanner-contained-rollback':'codex/usdt-scanner-linux-artifacts-v1'};
  const env={...process.env,...c,...meta};const r=spawnSync('npm',['run','build'],{cwd:path.join(root,'source'),env,stdio:'inherit'});if(r.status!==0)fail('PUBLIC_CONFIG_BUILD_FAILED');
  writeNew(path.join(root,'out','public-config-inline-audit.json'),{...auditBuild(root,c),pinnedDigests:pins.sha256,derivedBuildFields:meta,allowedPublicNames:publicNames});
 }else if(mode==='--audit'){console.log(JSON.stringify(auditBuild(root,configAt(root))));}
 else fail('MODE_REJECTED');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(/^[A-Z_]+$/.test(e.message)?e.message:'PUBLIC_CONFIG_CHECK_FAILED');process.exitCode=1;});
