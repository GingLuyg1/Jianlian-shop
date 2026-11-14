import test from 'node:test';
import assert from 'node:assert/strict';
import { main, summarizeKuajingZyCatalogShape } from '../../scripts/probe-kuajingzy-readonly.mjs';

const secret='fixture-super-secret-key';
test('redacted schema summary never includes product identifiers, names, prices or credentials',()=>{
  const out=summarizeKuajingZyCatalogShape([{id:'PRIVATE_SKU',title:'private title',price:12.34,stock:99}]);
  assert.deepEqual(out.itemKeys,['id','price','stock','title']);
  assert.equal(out.rootType,'array');
  assert.equal(out.rootArrayCount,1);
  assert.equal(out.purchaseEnabled,false);
  assert.equal(out.schemaVerified,false);
  for(const x of ['PRIVATE_SKU','private title','12.34','99',secret]) assert.equal(JSON.stringify(out).includes(x),false);
});

test('two exact GETs with server key; no purchase request, no raw balance or stock emitted',async()=>{
  const calls=[];
  const fetchImpl=async(url,opts)=>{
    calls.push({url,method:opts.method,auth:opts.headers.Authorization});
    const data=url.endsWith('/balance') ? {balance:'19.63',currency:'CNY'} : [{id:'SECRET_PRODUCT',price:'120',stock:42}];
    return Response.json({data});
  };
  const out=await main({key:secret,fetchImpl});
  assert.equal(out.balanceGet,'PASS');
  assert.equal(out.catalogGet,'PASS');
  assert.equal(out.balanceCurrency,'CNY');
  assert.deepEqual(calls.map(x=>[x.url,x.method]),[
    ['https://888.kuajing.one/api/open/v1/balance','GET'],
    ['https://888.kuajing.one/api/open/v1/catalog/mall','GET'],
  ]);
  assert.ok(calls.every(x=>x.auth==='Bearer '+secret));
  assert.equal(out.purchaseExecuted,false);
  assert.equal(out.productionChanged,false);
  const printed=JSON.stringify(out);
  for(const x of ['19.63','SECRET_PRODUCT','120','42',secret])assert.equal(printed.includes(x),false);
});

test('unauthorized key aborts without catalog request',async()=>{
  let calls=0;
  await assert.rejects(main({key:secret,fetchImpl:async()=>{
    calls++;return Response.json({error:{code:'UNAUTHORIZED',message:secret}},{status:401});
  }}),e=>e.code==='KUAJINGZY_AUTH_OR_PERMISSION'&&!String(e).includes(secret));
  assert.equal(calls,1);
});
