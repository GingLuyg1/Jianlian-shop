import test from 'node:test';
import assert from 'node:assert/strict';
import { createKuajingZyReadonlyClient, KuajingZyReadError } from '../../lib/providers/kuajingzy/readonly-client.mjs';
import { main as probe } from '../../scripts/probe-kuajingzy-readonly.mjs';

const key='synthetic-test-key-DO-NOT-PRINT';
const url='https://888.kuajing.one/api/open/v1/catalog/mall';
const jsonHeaders={ 'content-type': 'application/json' };
const valid=()=>Response.json({data:[{id:'synthetic-123',price:'10.0000'}]});

function clientWithResponse(getResponse) {
  const calls=[];
  const client=createKuajingZyReadonlyClient({
    apiKey:key,
    fetchImpl:async(request,init)=>{
      calls.push([request,init.method,init.headers.Authorization]);
      return getResponse();
    },
  });
  return {client,calls};
}
async function expectRedactedFailure(name,getResponse,expected) {
  await test(name,async()=>{
    const {client,calls}=clientWithResponse(getResponse);
    await assert.rejects(client.readMallCatalog(),error=>{
      assert.ok(error instanceof KuajingZyReadError);
      assert.equal(error.code,'KUAJINGZY_'+expected);
      assert.equal(String(error).includes(key),false);
      assert.equal(String(error).includes('secret-upstream-response'),false);
      assert.equal(JSON.stringify({code:error.code,status:error.status}).includes('secret-upstream-response'),false);
      return true;
    });
    assert.equal(calls.length,1);
    assert.deepEqual(calls[0],[url,'GET','Bearer '+key]);
  });
}

await expectRedactedFailure('GET 200: locked reader has narrow BODY_READER_ACQUIRE_FAILED classification',()=>{
  const r=valid();
  r.body.getReader(); // intentionally lock it (do not consume)
  return r;
},'BODY_READER_ACQUIRE_FAILED');

await expectRedactedFailure('GET 200: stream read error is BODY_STREAM_READ_FAILED without upstream text',()=>{
  return new Response(new ReadableStream({
    pull(controller){controller.error(new Error('secret-upstream-response'));}
  }),{headers:jsonHeaders});
},'BODY_STREAM_READ_FAILED');

await expectRedactedFailure('GET 200: invalid UTF8 is BODY_UTF8_INVALID',()=>{
  return new Response(Uint8Array.from([0xff,0xfe]),{headers:jsonHeaders});
},'BODY_UTF8_INVALID');

await expectRedactedFailure('GET 200: malformed JSON is BODY_JSON_INVALID',()=>{
  return new Response('{"data": ',{headers:jsonHeaders});
},'BODY_JSON_INVALID');

await expectRedactedFailure('GET 200: oversized JSON remains bounded and fail-closed',()=>{
  return Response.json({data:[{payload:'a'.repeat(260*1024)}]});
},'RESPONSE_TOO_LARGE');

await expectRedactedFailure('GET 200: content type mismatch is not an upstream transport failure',()=>{
  return new Response('secret-upstream-response',{headers:{'content-type':'text/plain'}});
},'CONTENT_TYPE_INVALID');

test('catalog-only scope never queries the already-proven account balance',async()=>{
  const calls=[];
  const result=await probe({
    key,
    scope:'catalog-only',
    fetchImpl:async(request,init)=>{
      calls.push([request,init.method,init.headers.Authorization]);
      if(request.endsWith('/balance'))throw Error('BALANCE_MUST_NOT_BE_QUERIED');
      return valid();
    },
  });
  assert.equal(result.balanceGet,'SKIPPED_PRIOR_PASS');
  assert.equal(result.balanceCurrency,null);
  assert.equal(result.catalogGet,'PASS');
  assert.equal(result.catalogShape.purchaseEnabled,false);
  assert.deepEqual(calls,[[url,'GET','Bearer '+key]]);
  for (const forbidden of ['synthetic-123',key,'10.0000']) {
    assert.equal(JSON.stringify(result).includes(forbidden),false);
  }
});

test('unknown scope refuses all network, no retry, no purchase',async()=>{
  let calls=0;
  await assert.rejects(
    probe({key,scope:'purchase',fetchImpl:async()=>{calls++;return valid();}}),
    error=>error.code==='KUAJINGZY_SCOPE_INVALID'&&!String(error).includes(key),
  );
  assert.equal(calls,0);
});

test('status 200 with no stream is classified before parsing',async()=>{
  const response=valid();
  Object.defineProperty(response,'body',{value:null});
  const {client,calls}=clientWithResponse(()=>response);
  await assert.rejects(client.readMallCatalog(),/KUAJINGZY_BODY_READER_MISSING/);
  assert.equal(calls.length,1);
});
