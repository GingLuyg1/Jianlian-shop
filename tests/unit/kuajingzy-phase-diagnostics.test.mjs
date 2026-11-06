import test from 'node:test';
import assert from 'node:assert/strict';
import {createKuajingZyReadonlyClient} from '../../lib/providers/kuajingzy/readonly-client.mjs';
const secret='SYNTHETIC_API_KEY_NEVER_LOG';
function client(fetchImpl,timeoutMs=12000){
  const evidence=[];let calls=0;
  return {evidence,get calls(){return calls;},read:createKuajingZyReadonlyClient({apiKey:secret,timeoutMs,
    onDiagnostics:v=>evidence.push(v),fetchImpl:(...args)=>{calls++;return fetchImpl(...args);}}).readMallCatalogFiltered};
}
const payload={data:{domain:'mall',items:[]}};
const abort=signal=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error(secret)),{once:true}));
test('complete request emits four monotonic phases without URL/query/headers/secrets',async()=>{
  const f=client(async()=>Response.json(payload));await f.read({search:'PRIVATE_QUERY'});
  const d=f.evidence[0];assert.equal(f.calls,1);assert.equal(d.outcome,'PASS');assert.equal(d.stage,'COMPLETE');
  assert.equal(d.requestStartedMs,0);assert.ok(d.responseHeadersMs<=d.bodyStartedMs);
  assert.ok(d.bodyStartedMs<=d.bodyEndedMs);assert.ok(d.bodyEndedMs<=d.finishedMs);
  assert.ok(d.bytesRead>0);assert.equal(d.httpStatus,200);assert.ok(Object.isFrozen(d));
  assert.equal(d.dnsTcpTlsTiming,'NOT_MEASURED');assert.equal(d.supplierProcessingTime,'NOT_SEPARABLE_FROM_NETWORK');
  for(const s of [secret,'PRIVATE_QUERY','Authorization','https://'])assert.equal(JSON.stringify(d).includes(s),false);
});
test('pre-header timeout records exact boundary, not invented DNS/TCP/TLS attribution',async()=>{
  const f=client(async(_url,o)=>abort(o.signal),8);
  await assert.rejects(f.read({search:'x'}),e=>e.code==='KUAJINGZY_REQUEST_TIMEOUT');
  const d=f.evidence[0];assert.equal(d.stage,'BEFORE_RESPONSE_HEADERS');assert.equal(d.responseHeadersMs,null);
  assert.equal(d.bodyStartedMs,null);assert.equal(d.bodyEndedMs,null);assert.equal(d.bytesRead,0);assert.equal(f.calls,1);
});
test('connection rejection is TRANSPORT_FAILED before headers, original message not logged',async()=>{
  const f=client(async()=>{throw new Error('ECONNREFUSED '+secret)});
  await assert.rejects(f.read({search:'x'}),e=>e.code==='KUAJINGZY_TRANSPORT_FAILED'&&!String(e).includes(secret));
  assert.equal(f.evidence[0].stage,'BEFORE_RESPONSE_HEADERS');assert.equal(f.calls,1);
  assert.equal(JSON.stringify(f.evidence).includes('ECONNREFUSED'),false);
});
for(const firstChunk of [false,true])test('body timeout after headers, first chunk '+firstChunk,async()=>{
  const f=client(async(_url,o)=>{let read=0;return {ok:true,status:200,headers:new Headers({'content-type':'application/json'}),
    body:{getReader:()=>({async read(){if(firstChunk&&read++===0)return {done:false,value:new TextEncoder().encode('{')};return abort(o.signal);},async cancel(){}})}};},8);
  await assert.rejects(f.read({search:'x'}),e=>e.code==='KUAJINGZY_REQUEST_TIMEOUT');
  const d=f.evidence[0];assert.notEqual(d.responseHeadersMs,null);assert.equal(d.stage,firstChunk?'READING_BODY':'WAITING_BODY');
  assert.equal(d.bodyStartedMs===null,!firstChunk);assert.equal(d.bodyEndedMs,null);assert.equal(f.calls,1);
});
test('stream failure is distinct from timeout; no upstream text leaks',async()=>{
  const f=client(async()=>({ok:true,status:200,headers:new Headers({'content-type':'application/json'}),
    body:{getReader:()=>({async read(){throw new Error(secret);},async cancel(){throw new Error(secret);}})}}));
  await assert.rejects(f.read({search:'x'}),e=>e.code==='KUAJINGZY_BODY_STREAM_READ_FAILED');
  assert.equal(f.evidence[0].stage,'WAITING_BODY');assert.equal(f.calls,1);assert.equal(JSON.stringify(f.evidence).includes(secret),false);
});
test('body cap still fails with observed count and no completed-body claim',async()=>{
  const f=client(async()=>Response.json({data:{domain:'mall',items:[{description:'x'.repeat(270000)}]}}));
  await assert.rejects(f.read({search:'x'}),e=>e.code==='KUAJINGZY_RESPONSE_TOO_LARGE');
  assert.ok(f.evidence[0].bytesRead>262144);assert.equal(f.evidence[0].bodyEndedMs,null);assert.equal(f.calls,1);
});
test('diagnostic sink failure never alters read result or retries',async()=>{
  let calls=0;const f=createKuajingZyReadonlyClient({apiKey:secret,fetchImpl:async()=>{calls++;return Response.json(payload);},onDiagnostics:()=>{throw new Error(secret);}});
  assert.equal((await f.readMallCatalogFiltered({search:'x'})).saleAuthorized,false);assert.equal(calls,1);
});
test('JSON parsing failure is after complete body; status/schema failure stays fail closed',async()=>{
  const f=client(async()=>new Response('{',{headers:{'content-type':'application/json'}}));
  await assert.rejects(f.read({search:'x'}),e=>e.code==='KUAJINGZY_BODY_JSON_INVALID');
  assert.notEqual(f.evidence[0].bodyEndedMs,null);assert.equal(f.calls,1);
});
