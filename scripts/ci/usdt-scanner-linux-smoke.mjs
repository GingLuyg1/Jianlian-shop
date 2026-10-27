// Linux dependency/entrypoint smoke only. Financial SQL was already accepted
// against hosted Test; no database, real chain, email, or supplier is used here.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(process.cwd()+'/package.json'),ts=require('typescript');
const kind=process.argv[2],checks=[];
const pass=name=>checks.push(name);
function load(file,deps){const m={exports:{}};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',js)(name=>{if(name==='server-only')return{};if(name==='node:crypto')return require(name);assert.ok(name in deps,'UNEXPECTED_DEPENDENCY');return deps[name];},m,m.exports);return m.exports;}
globalThis.fetch=async()=>{throw Error('EXTERNAL_NETWORK_FORBIDDEN');};
const contract='0x'+'1'.repeat(40),receiver='0x'+'2'.repeat(40),sender='0x'+'3'.repeat(40),epoch=1800000000;
const hex=n=>'0x'+BigInt(n).toString(16),hash=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
Object.assign(process.env,{BSC_RPC_URL:'https://synthetic.invalid',BSC_CHAIN_ID:'56',BSC_USDT_CONTRACT:contract,BSC_USDT_DECIMALS:'18',BSC_REQUIRED_CONFIRMATIONS:'12',RECHARGE_BEP20_MAX_BLOCKS_PER_RUN:'1500',RECHARGE_BEP20_LOG_CHUNK_SIZE:'50',RECHARGE_BEP20_SCANNER_MODE:'order_driven'});
delete process.env.RECHARGE_BEP20_BLOCKMACHINE_API_KEY;delete process.env.RECHARGE_BEP20_RPC_URL;
if(kind==='rollback'){
 let serviceCalls=0;const snapshot=JSON.stringify({balance:20,ledgers:2,progress:[249,1001,1001],globalCursor:129397868});
 const scanner=load('lib/recharges/bep20-recharge-scanner.ts',{'@/lib/supabase/service-role':{getSupabaseServiceRoleClient(){serviceCalls++;throw Error('DATABASE_ACCESS_FORBIDDEN');}},'@/lib/email/recharge-success':{queueRechargeSuccessEmailBestEffort:async()=>{throw Error('EMAIL_FORBIDDEN');}}});
 for(const mode of ['legacy','order_driven',''])for(const dryRun of [false,true]){process.env.RECHARGE_BEP20_SCANNER_MODE=mode;await assert.rejects(scanner.scanRechargeBep20Transfers({dryRun}),e=>e.code==='RECHARGE_SCANNER_ROLLBACK_CONTAINED');}
 assert.equal(serviceCalls,0);assert.equal(snapshot,JSON.stringify({balance:20,ledgers:2,progress:[249,1001,1001],globalCursor:129397868}));
 pass('ROLLBACK_NO_DATABASE_OR_NETWORK_IN_ANY_MODE');pass('ROLLBACK_DRY_RUN_AND_WRITE_ENTRY_BOTH_REFUSE');pass('ROLLBACK_RETAINS_EXISTING_DATA_NO_MUTATION_PATH');
}else{
 const api=load('lib/recharges/bep20-scanner-rpc.ts',{}),planner=load('lib/recharges/bep20-order-scan-planner.ts',{});
 const window={id:'00000000-0000-4000-8000-000000000001',created_at:new Date((epoch+100)*1000).toISOString(),expires_at:new Date((epoch+1000)*1000).toISOString(),last_scanned_block:'994'};
 function harness({windows=[],dbError=false,busy=false,failRpc=false,failApply=false}={}){
  const state={chainCalls:[],applied:[],release:0,clock:0};
  const transport=api.createScannerRpcTransport({now:()=>state.clock,sleep:async n=>{state.clock+=n;},fetch:async(url,init)=>{assert.equal(url,'https://synthetic.invalid');const {method,params}=JSON.parse(init.body);state.chainCalls.push(method);if(failRpc)return new Response('{}',{status:403});let result;
   if(method==='eth_chainId')result='0x38';else if(method==='eth_call')result='0x12';else if(method==='eth_blockNumber')result=hex(1020);else if(method==='eth_getBlockByNumber'){const n=Number(BigInt(params[0]));result={number:hex(n),timestamp:hex(epoch+n),hash:hash(n)};}else if(method==='eth_getLogs'){const lo=Number(BigInt(params[0].fromBlock)),hi=Number(BigInt(params[0].toBlock));result=[999,1001].filter(n=>n>=lo&&n<=hi).map(n=>({address:contract,topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef','0x'+sender.slice(2).padStart(64,'0'),'0x'+receiver.slice(2).padStart(64,'0')],data:hex(10n**18n),transactionHash:hash(n+10000),logIndex:'0x0',blockNumber:hex(n),blockHash:hash(n)}));}else throw Error('UNEXPECTED_CHAIN_METHOD');return new Response(JSON.stringify({result}));}});
  const service={from(name){assert.equal(name,'payment_channels');return{select(){return this;},or(){return this;},eq(){return this;},async maybeSingle(){return{data:{public_config:{token_contract:contract,payment_address:receiver}},error:null};}};},async rpc(name,args){if(name==='lease_recharge_order_scan_v1')return dbError||busy?{error:{code:'SYNTHETIC_DB_REFUSAL'}}:{data:{windows,token:windows.length?'00000000-0000-4000-8000-000000000002':null,blockedHistory:0}};if(name==='release_recharge_order_scan_v1'){state.release++;return{data:null};}assert.equal(name,'apply_recharge_order_scan_chunk_v1');if(failApply)return{error:{code:'SYNTHETIC_ATOMIC_FAILURE'}};state.applied.push(args);return{data:{results:[],completed:args.p_progress.filter(x=>x.complete).map(x=>x.id)}};}};
  const scanner=load('lib/recharges/bep20-recharge-scanner.ts',{'@/lib/supabase/service-role':{getSupabaseServiceRoleClient:()=>service},'@/lib/email/recharge-success':{queueRechargeSuccessEmailBestEffort:async()=>{throw Error('EMAIL_FORBIDDEN');}},'@/lib/recharges/bep20-scanner-rpc':{...api,requestScannerRpc:transport},'@/lib/recharges/bep20-order-scan-planner':planner});return{state,run:scanner.scanRechargeBep20Transfers};
 }
 let h=harness();assert.equal((await h.run()).idleReason,'NO_OPEN_WINDOWS');assert.equal(h.state.chainCalls.length,0);pass('ZERO_ORDERS_ZERO_ALL_CHAIN_RPC');
 h=harness({dbError:true});await assert.rejects(h.run(),e=>e.code==='ORDER_SCAN_DATABASE_NOT_READY');assert.equal(h.state.chainCalls.length,0);pass('DATABASE_ERROR_STOPS_BEFORE_CHAIN_READ');
 h=harness({busy:true});await assert.rejects(h.run());assert.equal(h.state.chainCalls.length,0);pass('LEASE_CONCURRENCY_REFUSAL_NO_CHAIN_OR_APPLY');
 h=harness({windows:[window],failRpc:true});await assert.rejects(h.run());assert.equal(h.state.applied.length,0);assert.equal(h.state.release,1);pass('RPC_403_NO_PROGRESS_OR_CREDIT_RELEASES_OWN_LEASE');
 h=harness({windows:[window],failApply:true});await assert.rejects(h.run(),e=>e.code==='ORDER_SCAN_CHUNK_UNCERTAIN');assert.equal(h.state.applied.length,0);assert.equal(h.state.release,1);pass('UNCERTAIN_DATABASE_CHUNK_STOPS_WITHOUT_RETRY');
 h=harness({windows:[window]});await h.run();assert.equal(h.state.applied.length,1);const sent=h.state.applied[0];assert.equal(sent.p_progress[0].from,'995');assert.equal(sent.p_progress[0].to,'1001');assert.equal(sent.p_progress[0].complete,true);assert.equal(h.state.chainCalls.filter(x=>x==='eth_getLogs').length,1);pass('DURABLE_PROGRESS_RESUMED_AND_FINITE_WINDOW_CLOSED');
 assert.equal(sent.p_evidence.length,2);assert.equal(Date.parse(sent.p_evidence[0].blockTimestamp),Date.parse(window.expires_at)-1000);assert.ok(Date.parse(sent.p_evidence[1].blockTimestamp)>Date.parse(window.expires_at));assert.ok(sent.p_evidence[0].confirmationCount>=12);pass('ACTUAL_SCANNER_RETAINS_CHAIN_TIMESTAMPS_AND_DELAYED_CONFIRMATIONS');
 await assert.rejects(planner.planOrderScanRanges([{...window,expires_at:new Date((epoch+1300)*1000).toISOString()}],1008n,async n=>({timestamp:epoch+Number(n),hash:hash(n)})),/ORDER_SCAN_WINDOW_INVALID/);pass('LEGACY_TWENTY_MINUTE_ORDER_NOT_REINTERPRETED_AS_FIFTEEN');
}
console.log(JSON.stringify({kind,passed:checks.length,checks,financialSql:'REUSED_PREVIOUS_HOSTED_TEST_ACCEPTANCE_NOT_REEXECUTED',productionAccess:false,externalNetworkCalls:0},null,2));
