import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {readProductCategoryError,readSkuCategoryError} from '../../lib/products/draft-category-guard.mjs';
import {deriveSkuProductSummary} from '../../lib/products/sku-editor.mjs';
import {buildEffectiveCategoryVisibility,isProductEffectivelyVisible} from '../../lib/catalog/effective-category-visibility.mjs';
const base={parent:{id:'parent',parent_id:null,is_active:true},leaf:{id:'leaf',parent_id:'parent',is_active:false}};
function service({categories=base,count=0,error=false,product={id:'p',category_id:'leaf'}}={}){
 return {from(table){let id;return {select(){return this;},eq(k,v){if(k==='id')id=v;return this;},async maybeSingle(){return {data:table==='products'?product:categories[id]??null,error:error?{}:null};},then(resolve){return Promise.resolve({count,error:error?{}:null}).then(resolve);}};}};
}
test('hidden leaf allows draft with real parent and no children',async()=>assert.equal(await readProductCategoryError(service(),'leaf','draft'),null));
for(const status of ['active','sold_out','inactive',undefined])test('hidden leaf rejects '+status,async()=>assert.ok(await readProductCategoryError(service(),'leaf',status)));
test('enabled leaf preserves normal active publication',async()=>assert.equal(await readProductCategoryError(service({categories:{...base,leaf:{...base.leaf,is_active:true}}}),'leaf','active'),null));
test('hidden ancestor cannot be bypassed by enabled leaf',async()=>assert.ok(await readProductCategoryError(service({categories:{parent:{...base.parent,is_active:false},leaf:{...base.leaf,is_active:true}}}),'leaf','active')));
test('hidden ancestor permits draft',async()=>assert.equal(await readProductCategoryError(service({categories:{parent:{...base.parent,is_active:false},leaf:{...base.leaf,is_active:true}}}),'leaf','draft'),null));
test('draft cannot use nonleaf',async()=>assert.ok(await readProductCategoryError(service({count:1}),'leaf','draft')));
test('draft cannot use missing category',async()=>assert.ok(await readProductCategoryError(service(),'missing','draft')));
test('draft cannot use missing ancestor',async()=>assert.ok(await readProductCategoryError(service({categories:{leaf:base.leaf}}),'leaf','draft')));
test('category read failure fails closed',async()=>assert.ok(await readProductCategoryError(service({error:true}),'leaf','draft')));
test('unknown child count fails closed',async()=>assert.ok(await readProductCategoryError(service({count:null}),'leaf','draft')));
test('cyclic category fails closed',async()=>assert.ok(await readProductCategoryError(service({categories:{leaf:{...base.leaf,parent_id:'leaf'}}}),'leaf','draft')));
test('SKU draft permits hidden category without publication',async()=>assert.equal(await readSkuCategoryError(service(),'p',['draft']),null));
for(const status of ['active','sold_out'])test('SKU '+status+' blocked in hidden category',async()=>assert.ok(await readSkuCategoryError(service(),'p',[status])));
test('SKU mixed batch cannot hide activation among drafts',async()=>assert.ok(await readSkuCategoryError(service(),'p',['draft','active'])));
test('SKU missing parent fails closed',async()=>assert.ok(await readSkuCategoryError(service({product:null}),'p',['active'])));
test('one SKU remains owned by one product without losing has_skus',()=>assert.deepEqual(deriveSkuProductSummary([{status:'draft',price:44.4,stock:0}]),{price:null,stock:0,has_skus:true}));
test('draft and hidden leaf cannot appear in existing frontend visibility',()=>{const v=buildEffectiveCategoryVisibility(Object.values(base));assert.equal(isProductEffectivelyVisible({category_id:'leaf',status:'draft'},v),false);assert.equal(isProductEffectivelyVisible({category_id:'leaf',status:'active'},v),false);});
test('every existing HTTP publication entry calls guard before write',()=>{
 const files=['app/api/admin/catalog/products/route.ts','app/api/admin/catalog/products/[productId]/route.ts','app/api/admin/catalog/products/[productId]/status/route.ts','app/api/admin/products/[id]/status/route.ts'];
 for(const p of files){const s=fs.readFileSync(p,'utf8');assert.ok(s.includes('await assertProductCategory('),p);}
 for(const p of ['app/api/admin/products/[id]/skus/route.ts','app/api/admin/products/[id]/skus/[skuId]/route.ts','app/api/admin/products/[id]/skus/workspace/route.ts','app/api/admin/products/[id]/skus/bulk/_shared.ts'])assert.ok(fs.readFileSync(p,'utf8').includes('await readSkuCategoryError('),p);
});
