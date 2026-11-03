import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
function load(file,deps={}){const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('require','module','exports',code)(n=>n==='server-only'?{}:n==='node:crypto'?require(n):deps[n]??assert.fail(n),m,m.exports);return m.exports;}
const hex=n=>'0x'+BigInt(n).toString(16),hash=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
const token='0x'+'11'.repeat(20),receiver='0x'+'22'.repeat(20),base=1_700_000_000;
const iso=n=>new Date((base+n)*1000).toISOString();
const env={...process.env};
Object.assign(process.env,{RECHARGE_BEP20_SCANNER_MODE:'order_driven',BSC_RPC_URL:'https://synthetic.invalid',BSC_USDT_CONTRACT:token,BSC_USDT_DECIMALS:'18',BSC_REQUIRED_CONFIRMATIONS:'12',RECHARGE_BEP20_MAX_BLOCKS_PER_RUN:'10000',RECHARGE_BEP20_LOG_CHUNK_SIZE:'50'});
delete process.env.RECHARGE_BEP20_RPC_URL;delete process.env.RECHARGE_BEP20_BLOCKMACHINE_API_KEY;
test.after(()=>{process.env=env;});
function fixture({fault=null,dense=false,steal=false}={}){
 const windows=[1000,10000,40000].map((n,i)=>({id:'w'+i,created_at:iso(n),expires_at:iso(n+900),last_scanned_block:null,complete:false}));
 const counts=[],starts=[],ledger=new Set();let lease=null,applies=0,credits=0;
 async function run({dryRun=false}={}){
  let calls=0,logCalls=0,clock=0;const transport=load('lib/recharges/bep20-scanner-rpc.ts');
  const request=transport.createScannerRpcTransport({now:()=>clock,sleep:async n=>{clock+=n;},timeoutMs:5,fetch:async(_u,init)=>{
   calls++;const {method,params}=JSON.parse(init.body);let result;
   const block=n=>({number:hex(n),timestamp:hex(base+n),hash:hash(n)});
   if(method==='eth_chainId')result='0x38';else if(method==='eth_call')result='0x12';else if(method==='eth_blockNumber')result=hex(100000);
   else if(method==='eth_getBlockByNumber')result=block(Number(BigInt(params[0])));
   else if(method==='eth_getLogs'){
    logCalls++;const from=Number(BigInt(params[0].fromBlock)),to=Number(BigInt(params[0].toBlock));starts.push(from);
    if(fault&&logCalls===2){if(fault==='timeout')return new Promise(()=>{});if(fault==='invalid')return new Response('{');return new Response('{}',{status:429});}
    const blocks=dense?Array.from({length:50},(_,i)=>from+i):from<=1010&&to>=1010?[1010]:[];
    result=blocks.map(n=>({address:token,topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef','0x'+'33'.repeat(32),'0x'+receiver.slice(2).padStart(64,'0')],data:hex(10n**18n),transactionHash:hash(n),logIndex:'0x0',blockNumber:hex(n),blockHash:hash(n)}));
   }else assert.fail(method);
   return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result}));
  }});
  const service={from(){return {select(){return this;},or(){return this;},eq(){return this;},maybeSingle:async()=>({data:{public_config:{token_contract:token,payment_address:receiver}},error:null})};},async rpc(name,args){
   if(name==='lease_recharge_order_scan_v1'){assert.equal(lease,null);if(!args.p_dry_run)lease='owned';return {data:{windows:windows.filter(w=>!w.complete).map(({complete,...w})=>({...w})),token:args.p_dry_run?null:lease},error:null};}
   if(name==='release_recharge_order_scan_v1'){if(args.p_token===lease)lease=null;return {data:null,error:null};}
   assert.equal(name,'apply_recharge_order_scan_chunk_v1');assert.equal(args.p_token,lease);assert.equal(dryRun,false);applies++;
   for(const p of args.p_progress){const w=windows.find(w=>w.id===p.id);if(w.last_scanned_block!==null)assert.equal(BigInt(p.from),BigInt(w.last_scanned_block)+1n);w.last_scanned_block=p.to;w.complete=p.complete;}
   const results=args.p_evidence.map(e=>{const seen=ledger.has(e.txHash);ledger.add(e.txHash);if(!seen)credits++;return {result:seen?'already_matched':'matched',credited:!seen,alreadyCredited:seen,rechargeId:'synthetic'};});
   if(steal)lease='other-owner';
   return {data:{results,completed:windows.filter(w=>w.complete&&args.p_progress.some(p=>p.id===w.id)).map(w=>w.id)},error:null};
  }};
  const scan=load('lib/recharges/bep20-recharge-scanner.ts',{'@/lib/supabase/service-role':{getSupabaseServiceRoleClient:()=>service},'@/lib/email/recharge-success':{queueRechargeSuccessEmailBestEffort:async()=>{}},'@/lib/recharges/bep20-scanner-rpc':{...transport,requestScannerRpc:request},'@/lib/recharges/bep20-order-scan-planner':load('lib/recharges/bep20-order-scan-planner.ts')});
  try{return await scan.scanRechargeBep20Transfers({dryRun});}finally{counts.push(calls);}
 }
 return {run,windows,counts,starts,ledger,get applies(){return applies;},get credits(){return credits;},get lease(){return lease;}};
}
test('three expensive windows commit partial progress, resume and finish within128 calls per run',async()=>{
 const f=fixture();let budget=false;
 for(let i=0;i<12&&!f.windows.every(w=>w.complete);i++){
  const before=f.windows.map(w=>w.last_scanned_block),oldApplies=f.applies;const r=await f.run();
  assert.ok(f.counts.at(-1)<=128);assert.equal(f.lease,null);assert.ok(f.applies>oldApplies);
  if(r.idleReason==='RESOURCE_BUDGET')budget=true;
  assert.ok(f.windows.some((w,i)=>w.last_scanned_block!==before[i]));
 }
 assert.equal(budget,true);assert.ok(f.windows.every(w=>w.complete));assert.equal(f.ledger.size,1);assert.equal(f.credits,1);
 const r=await f.run();assert.equal(r.idleReason,'NO_OPEN_WINDOWS');assert.equal(f.credits,1);
});
for(const fault of ['429','timeout','invalid'])test('provider '+fault+' preserves committed chunk, refuses unfinished chunk, releases lease',async()=>{
 const f=fixture({fault});await assert.rejects(f.run(),e=>e.code?.startsWith('BSC_RPC_'));assert.equal(f.windows[0].last_scanned_block,'1049');assert.equal(f.applies,1);assert.equal(f.credits,1);assert.equal(f.lease,null);assert.ok(f.counts[0]<=128);
});
test('budget exhaustion with no durable commit stays fail closed (including dry run)',async()=>{const f=fixture({dense:true});await assert.rejects(f.run({dryRun:true}),e=>e.code==='ORDER_SCAN_RESOURCE_BUDGET');assert.equal(f.applies,0);assert.equal(f.lease,null);assert.ok(f.counts[0]<=128);});
test('release never clears a lease now owned by another runner',async()=>{const f=fixture({steal:true});await assert.rejects(f.run());assert.equal(f.lease,'other-owner');});
