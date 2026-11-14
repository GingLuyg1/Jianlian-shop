import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfflineCatalogPageAudit, KUAJINGZY_BOUNDED_CATALOG_LIMITS as LIMITS } from '../../lib/providers/kuajingzy/bounded-catalog-pages.mjs';
const page=(number,hasMore=true,productIds=[`item-${number}`],bytesRead=100) => ({pageNumber:number,hasMore,productIds,bytesRead});

test('complete only after explicit documented terminal page',()=>{
  const s=createOfflineCatalogPageAudit();
  assert.equal(s.accept(page(1)).status,'CONTINUE');
  const result=s.accept(page(2,false));
  assert.equal(result.status,'COMPLETE');
  assert.equal(result.complete,true);
  assert.equal(result.saleAuthorized,false);
  assert.equal(result.totalItems,2);
  assert.throws(()=>s.accept(page(3,false)),/ALREADY_TERMINAL/);
});

test('five pages with remaining data is explicitly partial, not approved catalog',()=>{
  const s=createOfflineCatalogPageAudit();
  for(let i=1;i<5;i++) assert.equal(s.accept(page(i)).status,'CONTINUE');
  const result=s.accept(page(5));
  assert.equal(result.status,'PARTIAL_BOUNDED');
  assert.equal(result.complete,false);
  assert.equal(result.saleAuthorized,false);
});

test('full-page cumulative bound fails closed',()=>{
  const s=createOfflineCatalogPageAudit();
  for(let i=1;i<=4;i++) assert.equal(s.accept(page(i,true,[`n-${i}`],LIMITS.maxPageBytes)).status,i===4?'PARTIAL_BOUNDED':'CONTINUE');
  assert.throws(()=>s.accept(page(5)),/ALREADY_TERMINAL/);
});

test('oversized single page is refused; state unchanged',()=>{
  const s=createOfflineCatalogPageAudit();
  assert.throws(()=>s.accept(page(1,true,['1'],LIMITS.maxPageBytes+1)),/PAGE_SIZE_INVALID/);
  assert.equal(s.snapshot().pageCount,0);
});

test('duplicate product across pages fails closed',()=>{
  const s=createOfflineCatalogPageAudit();
  s.accept(page(1,true,['p1','p2']));
  assert.throws(()=>s.accept(page(2,true,['p2'])),/DUPLICATE_PRODUCT/);
  assert.equal(s.snapshot().pageCount,1);
});

test('duplicate within same page fails closed',()=>{
  const s=createOfflineCatalogPageAudit();
  assert.throws(()=>s.accept(page(1,true,['a','a'])),/DUPLICATE_PRODUCT/);
  assert.equal(s.snapshot().pageCount,0);
});

test('out-of-order, missing boolean termination and invalid ID rejected',()=>{
  const s=createOfflineCatalogPageAudit();
  assert.throws(()=>s.accept(page(2)),/PAGE_ORDER_INVALID/);
  assert.throws(()=>s.accept({...page(1),hasMore:undefined}),/TERMINATION_UNKNOWN/);
  assert.throws(()=>s.accept(page(1,true,['bad\nID'])),/PRODUCT_ID_INVALID/);
  assert.equal(s.snapshot().pageCount,0);
});

test('non-advancing empty page is partial, not complete',()=>{
  const s=createOfflineCatalogPageAudit();
  const r=s.accept(page(1,true,[]));
  assert.equal(r.status,'PARTIAL_EMPTY_PAGE');
  assert.equal(r.complete,false);
});

test('no raw IDs or key contents in returned summaries',()=>{
  const s=createOfflineCatalogPageAudit();
  const r=s.accept(page(1,false,['SENSITIVE_PRODUCT_ID_123']));
  assert.doesNotMatch(JSON.stringify(r),/SENSITIVE_PRODUCT_ID_123/);
  assert.doesNotMatch(JSON.stringify(s),/SENSITIVE_PRODUCT_ID_123/);
});
