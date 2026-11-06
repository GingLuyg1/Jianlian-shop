import test from 'node:test';
import assert from 'node:assert/strict';
import { collectAccountShortlist } from '../../scripts/collect-account-product-shortlist.mjs';

const aju=(title='苹果ID 新号',stock=3,isAuto=true)=>({
  id:33,title,price:8.45,stock,sales:0,isAuto,
});
const ku=(name,id)=>({id,name,unitPrice:19.50,prices:{CNY:19.50},stock:12,variants:[{id:'V1'}]});
const fakeKuajing=(calls)=>({
  async readMallCatalogFiltered(args){
    calls.push(args);
    const map={
      'Apple ID':[ku('Apple ID 老号',123)],
      'Telegram':[ku('Telegram 新号',124)],
      'Threads':[ku('Threads 账号',125)],
      'Instagram':[ku('Instagram 账号',126)],
      'Outlook':[ku('Outlook 邮箱',127)],
      'Gmail':[ku('Gmail 教育企业域名',128),ku('Gmail 新号',129)],
      'Facebook':[ku('Facebook 账号',130)],
      'Steam':[ku('Steam 账号',131),ku('Steam 礼品卡',132)],
    };
    return {data:{domain:'mall',items:map[args.search]||[]}};
  }
});

test('Daju in-stock auto-delivery Apple ID has priority; other brands use filtered Kuajing GET once',async()=>{
  let dajuCalls=0;const kuCalls=[];
  const out=await collectAccountShortlist({
    daju:{async getProducts(query){dajuCalls++;assert.equal(query,'苹果');return[aju()]}},
    kuajingzy:fakeKuajing(kuCalls),
  });
  assert.equal(out.complete,true);assert.equal(out.blocked,null);
  assert.equal(out.requests,8);assert.equal(dajuCalls,1);assert.equal(kuCalls.length,7);
  assert.equal(kuCalls[0].search,'Telegram');
  assert.equal(out.families['apple-id'].status,'DAJU_AVAILABLE');
  assert.deepEqual(out.candidates.filter(x=>x.family==='apple-id').map(x=>x.provider),['daju']);
  assert.equal(out.candidates.some(x=>x.family==='steam'&&x.title==='Steam 礼品卡'),false);
  assert.ok(out.candidates.some(x=>x.family==='google'&&x.groupKey==='google-edu-enterprise'));
  assert.ok(out.candidates.every(x=>!x.saleEnabled&&!x.finalFeeInclusiveDebitVerified&&!x.fulfillmentContractVerified));
  assert.equal(out.purchaseEnabled,false);
});

test('No in-stock auto Daju Apple ID causes one Kuajing Apple fallback query',async()=>{
  const calls=[];
  const out=await collectAccountShortlist({
    daju:{async getProducts(){return [aju('苹果ID 新号',0),{...aju('苹果ID 老号',3,false),id:34}]}},
    kuajingzy:fakeKuajing(calls),
  });
  assert.equal(out.complete,true);
  assert.equal(out.requests,9);
  assert.equal(calls[0].search,'Apple ID');
  assert.equal(out.candidates.filter(x=>x.family==='apple-id').length,3);
  assert.equal(out.candidates.find(x=>x.provider==='kuajingzy'&&x.family==='apple-id').supplierSkuIds[0],'V1');
  assert.equal(out.candidates.every(x=>x.saleEnabled===false),true);
});

test('Supplier failure stops immediately with partial, no retries or purchase',async()=>{
  let kuCalls=0;
  const out=await collectAccountShortlist({
    daju:{async getProducts(){return [aju()]}},
    kuajingzy:{async readMallCatalogFiltered(){
      kuCalls++;throw Object.assign(new Error('Bearer SECRET_RESPONSE'),{code:'KUAJINGZY_REQUEST_TIMEOUT'});
    }},
  });
  assert.equal(out.complete,false);
  assert.equal(out.requests,2);
  assert.equal(kuCalls,1);
  assert.equal(out.blocked,'KUAJINGZY_REQUEST_TIMEOUT');
  assert.equal(JSON.stringify(out).includes('SECRET_RESPONSE'),false);
  assert.equal(out.candidates.length,1);
  assert.equal(out.productionChanged,false);
});

test('Shop list strips emails and URLs; sku detail unverified; display cost not authoritative',async()=>{
  const calls=[];
  const out=await collectAccountShortlist({
    daju:{async getProducts(){return [aju('苹果ID 联系 someone@testmail.com https://example.com 新号',1,true)]}},
    kuajingzy:fakeKuajing(calls),
  });
  const candidate=out.candidates[0];
  assert.equal(candidate.provider,'daju');
  assert.equal(candidate.title.includes('someone@testmail.com'),false);
  assert.equal(candidate.title.includes('https://example.com'),false);
  assert.equal(candidate.skuDetailVerified,false);
  assert.equal(candidate.displayPriceCny,'8.45');
  assert.equal(candidate.finalFeeInclusiveDebitVerified,false);
});

test('Malformed or giant supplier catalog aborts with safe generic blocker',async()=>{
  let calls=0;
  const out=await collectAccountShortlist({
    daju:{async getProducts(){calls++;return Array.from({length:151},(_,i)=>aju('苹果ID '+i,1,true))}},
    kuajingzy:fakeKuajing([]),
  });
  assert.equal(calls,1);
  assert.equal(out.complete,false);
  assert.equal(out.blocked,'SAFE_READ_FAILED');
  assert.equal(out.requests,1);
  assert.equal(out.purchaseEnabled,false);
});
