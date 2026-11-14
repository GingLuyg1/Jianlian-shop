import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildKuajingZyMallFilterPath, createKuajingZyReadonlyClient,
  KuajingZyReadError,
} from '../../lib/providers/kuajingzy/readonly-client.mjs';
import { main as probe } from '../../scripts/probe-kuajingzy-readonly.mjs';

const key='synthetic-only-key-for-unit-tests';
const BASE='https://888.kuajing.one/api/open/v1/catalog/mall';
const response=()=>Response.json({data:{domain:'mall',items:[
  {id:'NOT-FOR-LOGS',categoryId:'EXAMPLE_CAT',name:'PRIVATE_PRODUCT_NAME',unitPrice:9.95,prices:{CNY:9.95}},
]}});

test('exact documented search query is percent encoded (no guessed paging fields)',()=>{
  assert.equal(buildKuajingZyMallFilterPath({search:'礼品卡 US'}),
    '/api/open/v1/catalog/mall?search=%E7%A4%BC%E5%93%81%E5%8D%A1+US');
  assert.equal(buildKuajingZyMallFilterPath({category:'CAT-001'}),
    '/api/open/v1/catalog/mall?category=CAT-001');
});

test('category up to 120 UTF-8 bytes and search up to 200 UTF-8 bytes',()=>{
  assert.equal(buildKuajingZyMallFilterPath({category:'中'.repeat(40)}).startsWith('/api/open/v1/catalog/mall?category='),true);
  assert.throws(()=>buildKuajingZyMallFilterPath({category:'中'.repeat(41)}),/CATALOG_FILTER_INVALID/);
  assert.equal(buildKuajingZyMallFilterPath({search:'中'.repeat(66)}).startsWith('/api/open/v1/catalog/mall?search='),true);
  assert.throws(()=>buildKuajingZyMallFilterPath({search:'中'.repeat(67)}),/CATALOG_FILTER_INVALID/);
});

test('refuses undocumented page/cursor/limit, empty, combined and malformed filters',()=>{
  for(const arg of [
    null, [], {}, {page:1}, {limit:10}, {cursor:'foo'},
    {search:'foo',category:'bar'}, {search:''}, {search:' '},
    {search:' bad'}, {category:'bad\nid'}, {search:'x'.repeat(201)},
    {category:123}, {search:['x']},
  ]) assert.throws(()=>buildKuajingZyMallFilterPath(arg),/CATALOG_FILTER_INVALID/);
});

test('one bounded filtered mall GET, no balance, no POST, no raw catalog in output',async()=>{
  const calls=[];
  const out=await probe({
    scope:'catalog-filtered', key, filter:{search:'礼品卡'},
    fetchImpl:async(url,init)=>{
      calls.push({url,method:init.method,authorization:init.headers.Authorization,cache:init.cache,redirect:init.redirect});
      return response();
    },
  });
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,BASE+'?search=%E7%A4%BC%E5%93%81%E5%8D%A1');
  assert.equal(calls[0].method,'GET');
  assert.equal(calls[0].authorization,'Bearer '+key);
  assert.equal(calls[0].cache,'no-store');
  assert.equal(calls[0].redirect,'error');
  assert.equal(out.balanceGet,'SKIPPED_PRIOR_PASS');
  assert.equal(out.catalogGet,'PASS');
  assert.equal(out.filterMode,'SINGLE_DOCUMENTED_FILTER');
  assert.equal(out.fullCatalogVerified,false);
  assert.equal(out.catalogShape.rootType,'object');
  assert.equal(out.catalogShape.rootArrayCount,1);
  assert.deepEqual(out.catalogShape.rootKeys,['domain','items']);
  assert.equal(out.catalogShape.saleAuthorized,undefined);
  assert.equal(out.catalogShape.purchaseEnabled,false);
  for(const word of ['NOT-FOR-LOGS','PRIVATE_PRODUCT_NAME','EXAMPLE_CAT',key,'9.95'])
    assert.equal(JSON.stringify(out).includes(word),false);
});

test('missing and ambiguous filter stops without a request',async()=>{
  for(const filter of [undefined, {}, {category:'x',search:'x'},{offset:0}]){
    let calls=0;
    await assert.rejects(probe({
      scope:'catalog-filtered',filter,key,
      fetchImpl:async()=>{calls++;return response();},
    }),e=>e instanceof KuajingZyReadError && e.code==='KUAJINGZY_CATALOG_FILTER_INVALID');
    assert.equal(calls,0);
  }
});

test('HTTP 200 but filtered response schema drift fails closed',async()=>{
  let calls=0;
  const client=createKuajingZyReadonlyClient({apiKey:key,fetchImpl:async()=>{calls++;return Response.json({data:{domain:'mall',products:[]}});}});
  await assert.rejects(client.readMallCatalogFiltered({search:'礼品卡'}),/KUAJINGZY_CATALOG_SCHEMA_UNVERIFIED/);
  assert.equal(calls,1);
});

test('HTTP 200 > 256 KiB filtered response is rejected; no automatic retry',async()=>{
  let calls=0;
  const client=createKuajingZyReadonlyClient({apiKey:key,fetchImpl:async()=>{
    calls++;
    return Response.json({data:{domain:'mall',items:[{description:'z'.repeat(270*1024)}]}});
  }});
  await assert.rejects(client.readMallCatalogFiltered({search:'礼品卡'}),/KUAJINGZY_RESPONSE_TOO_LARGE/);
  assert.equal(calls,1);
});

test('HTTP 429 classified; no retry, no credential in exception',async()=>{
  let calls=0;
  const client=createKuajingZyReadonlyClient({apiKey:key,fetchImpl:async()=>{
    calls++;
    return Response.json({error:{message:'SECRET_FROM_VENDOR'}},{status:429});
  }});
  await assert.rejects(client.readMallCatalogFiltered({category:'x'}),e=>
    e.code==='KUAJINGZY_RATE_LIMIT' && !String(e).includes(key) && !String(e).includes('SECRET_FROM_VENDOR'));
  assert.equal(calls,1);
});

test('client exposes no purchase capability and catalog result stays sale-disabled',async()=>{
  const client=createKuajingZyReadonlyClient({apiKey:key,fetchImpl:async()=>response()});
  const data=await client.readMallCatalogFiltered({search:'x'});
  assert.equal(data.filtered,true);
  assert.equal(data.fullCatalog,false);
  assert.equal(data.saleAuthorized,false);
  assert.equal(data.costVerified,false);
  assert.equal(data.inventoryVerified,false);
  for(const unsafe of ['purchase','createOrder','recharge','post']) assert.equal(typeof client[unsafe],'undefined');
});
