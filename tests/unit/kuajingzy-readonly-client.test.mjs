import test from 'node:test';
import assert from 'node:assert/strict';
import { createKuajingZyReadonlyClient, KuajingZyReadError } from '../../lib/providers/kuajingzy/readonly-client.mjs';

const secret = 'synthetic-key-material-do-not-log';
function response(data, status=200) { return Response.json(data, {status}); }
function fixture(payload=response({ data: { balance: '19.63', currency: 'CNY' } })) {
  const calls=[];
  const client=createKuajingZyReadonlyClient({apiKey:secret, fetchImpl:async(url, opts)=>{
    calls.push({url,method:opts.method,headers:opts.headers,cache:opts.cache,redirect:opts.redirect});
    return payload;
  }});
  return {client,calls};
}

test('approved read-only balance path returns normalized CNY without leaking credentials',async()=>{
  const f=fixture(), result=await f.client.readBalance();
  assert.equal(result.availableBalance,'19.63');
  assert.equal(result.currency,'CNY');
  assert.equal(result.purchaseAuthorized,false);
  assert.equal(f.calls.length,1);
  assert.deepEqual(f.calls.map(x=>[x.url,x.method]),[['https://888.kuajing.one/api/open/v1/balance','GET']]);
  assert.equal(f.calls[0].headers.Authorization,'Bearer '+secret);
  assert.equal(f.calls[0].redirect,'error');
  assert.equal(f.calls[0].cache,'no-store');
  assert.equal(JSON.stringify(result).includes(secret),false);
  assert.equal(typeof f.client.purchase,'undefined');
  assert.equal(typeof f.client.createOrder,'undefined');
  assert.equal(typeof f.client.request,'undefined');
  assert.ok(Object.isFrozen(result));
});

test('catalog returns server-only data with sale and cost flags closed',async()=>{
  const f=fixture(response({data:[{id:'fixture-product-1',price:'10.0000'}]}));
  const result=await f.client.readMallCatalog();
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].url,'https://888.kuajing.one/api/open/v1/catalog/mall');
  assert.equal(result.data[0].id,'fixture-product-1');
  assert.equal(result.saleAuthorized,false);
  assert.equal(result.costVerified,false);
  assert.equal(result.inventoryVerified,false);
  assert.equal(JSON.stringify(result).includes(secret),false);
});

for (const [name,data,pattern] of [
  ['USD balance',{balance:'10',currency:'USD'},/BALANCE_CURRENCY_INVALID/],
  ['negative amount',{balance:'-10',currency:'CNY'},/BALANCE_AMOUNT_INVALID/],
  ['too many decimals',{balance:'1.23456',currency:'CNY'},/BALANCE_AMOUNT_INVALID/],
  ['scientific notation',{balance:1e-9,currency:'CNY'},/BALANCE_AMOUNT_INVALID/],
]) test('balance rejects '+name,async()=>{
  const f=fixture(response({data}));
  await assert.rejects(f.client.readBalance(),pattern);
  assert.equal(f.calls.length,1);
});

test('invalid credentials fail before any request',()=>{
  for (const apiKey of ['', 'a', 'has\nnewline', ' leading spaces']) {
    assert.throws(()=>createKuajingZyReadonlyClient({apiKey,fetchImpl:async()=>{throw Error('network must not run')}}),/CREDENTIALS_REQUIRED/);
  }
});

for (const [status,code] of [[401,'AUTH_OR_PERMISSION'],[403,'AUTH_OR_PERMISSION'],[429,'RATE_LIMIT'],[503,'MAINTENANCE'],[500,'HTTP_ERROR']]) {
  test('HTTP '+status+' returns redacted error without retry', async()=>{
    let count=0;
    const client=createKuajingZyReadonlyClient({apiKey:secret,fetchImpl:async()=>{count++;return Response.json({error:{message:secret}},{status});}});
    await assert.rejects(client.readBalance(),e=> e instanceof KuajingZyReadError && e.code==='KUAJINGZY_'+code && !String(e).includes(secret));
    assert.equal(count,1);
  });
}

test('unexpected response or supplier error wrapper fails closed',async()=>{
  for(const payload of [
    response({error:{code:'API_NOT_AVAILABLE',message:secret}}),
    response({data:{currency:'CNY',balance:'100.00'},error:{code:'OTHER'}}),
    response([]),
    new Response('not json',{headers:{'content-type':'application/json'}}),
    new Response('text',{headers:{'content-type':'text/plain'}}),
  ]) {
    const f=fixture(payload);
    await assert.rejects(f.client.readBalance(),e=> !String(e).includes(secret));
    assert.equal(f.calls.length,1);
  }
});

test('response size bound fails closed without disclosing body',async()=>{
  const oversized='x'.repeat(257*1024);
  const f=fixture(response({data:{value:oversized}}));
  await assert.rejects(f.client.readMallCatalog(),/RESPONSE_TOO_LARGE/);
  assert.equal(f.calls.length,1);
});

test('transport rejection has redacted generic error and never retries',async()=>{
  let count=0;
  const client=createKuajingZyReadonlyClient({apiKey:secret,fetchImpl:async()=>{count++;throw Error('private '+secret)}});
  await assert.rejects(client.readBalance(),e=>e.code==='KUAJINGZY_TRANSPORT_FAILED'&&!String(e).includes(secret));
  assert.equal(count,1);
});
