import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeKuajingZyCatalog as normalize,prepareKuajingZySkuCandidate as bind,prepareKuajingZySkuCandidates as batch} from '../../lib/providers/kuajingzy/catalog-mapping.mjs';
const sample=()=>({domain:'mall',items:[{id:'SYNTHETIC-1',name:'Synthetic licensed digital code',categoryId:'CAT-1',categoryName:'Synthetic',platform:'Synthetic',unitPrice:10.12,prices:{CNY:'10.1200'},spec:'fixed',stock:5,delivery:'PIN'}]});
const candidate=item=>({websiteProductId:'website-product',websiteSkuId:'website-sku',skuProductId:'website-product',skuCode:'SYNTH-SKU',catalogItem:item,expectedSupplierProductId:'SYNTHETIC-1'});
test('documented fields preserved as observations; examples are never inventory/fee authority',()=>{
  const x=normalize(sample());assert.equal(x.productCount,1);const p=x.items[0];
  assert.equal(p.productId,'SYNTHETIC-1');assert.equal(p.categoryId,'CAT-1');assert.equal(p.displayUnitPrice,'10.12');
  assert.deepEqual(p.displayPrices,[{currency:'CNY',amount:'10.1200'}]);assert.equal(p.identityComplete,true);
  assert.equal(p.automaticSaleAllowed,false);assert.ok(p.blockReasons.includes('NOT_A_LIVE_OBSERVATION'));
  assert.ok(p.unverifiedFieldNames.includes('stock'));assert.deepEqual(p.observed,{});
});
test('explicit supplemental field names are typed only, not an invented delivery contract',()=>{
  const x=normalize(sample(),{provenance:'synthetic',fieldMap:{stock:'stock',specification:'spec',deliveryMethod:'delivery'}}).items[0];
  assert.deepEqual(x.observed.stock,{field:'stock',present:true,type:'number',value:5,contractVerified:false});
  assert.equal(x.observed.specification.value,'fixed');assert.equal(x.observed.deliveryMethod.value,'PIN');
  assert.equal(x.observed.deliveryMethod.contractVerified,false);assert.equal(x.purchaseEnabled,false);
});
test('even authenticated catalog is not permission, final cost, stock or delivery proof',()=>{
  const p=normalize(sample(),{provenance:'authenticated_catalog'}).items[0];
  assert.equal(p.automaticSaleAllowed,false);assert.ok(p.blockReasons.includes('FINAL_FEE_INCLUSIVE_COST_UNVERIFIED'));
});
for(const raw of [null,{},[],{domain:'other',items:[]},{domain:'mall',items:{}},{domain:'mall',items:[null]}])test('malformed catalog fails closed '+JSON.stringify(raw),()=>assert.throws(()=>normalize(raw),/KUAJINGZY_/));
test('missing identity and ambiguous numeric ID cannot bind',()=>{
  for(const input of [{name:'x'},{id:'good'},{id:9007199254740992,name:'x'}]){
    const p=normalize({domain:'mall',items:[input]}).items[0];assert.equal(p.identityComplete,false);
    assert.throws(()=>bind(candidate(p)),/SKU_SUPPLIER_IDENTITY_MISMATCH/);
  }
});
test('duplicate product IDs reject whole set; oversized catalog is not truncated to pass',()=>{
  const s=sample();s.items.push({...s.items[0]});assert.throws(()=>normalize(s),/DUPLICATE_ID/);
  assert.throws(()=>normalize({domain:'mall',items:[{description:'x'.repeat(262144)}]}),/RESPONSE_TOO_LARGE/);
});
test('candidate binding freezes local SKU ownership and exact supplier product, never activates',()=>{
  const p=normalize(sample()).items[0],a=bind(candidate(p));assert.equal(a.automaticPurchaseEnabled,false);assert.equal(a.saleEnabled,false);
  assert.equal(a.bindingFingerprint,bind(candidate(p)).bindingFingerprint);
  assert.throws(()=>bind({...candidate(p),skuProductId:'another'}),/SKU_OWNER_MISMATCH/);
  assert.throws(()=>bind({...candidate(p),expectedSupplierProductId:'another'}),/SKU_SUPPLIER_IDENTITY_MISMATCH/);
});
test('candidate patch uses existing metadata slot, never updates active supplier binding; duplicates rejected',()=>{
  const p=normalize(sample()).items[0],a=bind(candidate(p));
  assert.deepEqual(Object.keys(a.metadataPatch),['supplier_binding_candidate']);
  assert.equal(a.metadataPatch.supplier_binding_candidate.supplier_auto_purchase_enabled,false);
  assert.throws(()=>batch([candidate(p),candidate(p)]),/DUPLICATE_SKU_BINDING/);
});
test('unknown credentials/PIN/URLs and nested delivery data are not copied into normalized DTO',()=>{
  const raw=sample();Object.assign(raw.items[0],{api_key:'SECRET',redemption_info:{pin:'PRIVATE_PIN'},description:'SECRET',stock:{pin:'PRIVATE_PIN'},delivery:'https://private.invalid/token'});
  const serialized=JSON.stringify(normalize(raw,{fieldMap:{stock:'stock',deliveryMethod:'delivery'}}));
  for(const s of ['PRIVATE_PIN','SECRET','https://private.invalid'])assert.equal(serialized.includes(s),false);
});
test('unverified currencies and imprecise display prices are not promoted to exact CNY costs',()=>{
  const raw=sample();raw.items[0].unitPrice=1e-9;raw.items[0].prices={CNY:'1.23456',USD:'4.00'};
  const p=normalize(raw).items[0];assert.equal(p.displayUnitPrice,null);assert.deepEqual(p.displayPrices,[{currency:'USD',amount:'4.00'}]);
  assert.equal(p.purchaseEnabled,false);
});
