// Offline observation DTO, never a sale/stock/cost authority or provider registry entry.
import { createHash } from 'node:crypto';
const need=(condition,code)=>{if(!condition)throw new Error('KUAJINGZY_'+code);};
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&v.length>0&&v.length<=200&&!/[\u0000-\u001f\u007f<>]|https?:\/\//i.test(v);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(v)?v
  :Number.isSafeInteger(v)&&v>=0?String(v):null;
const money=v=>{
  const s=typeof v==='number'&&Number.isFinite(v)?String(v):v;
  return typeof s==='string'&&/^(0|[1-9]\d{0,11})(?:\.\d{1,4})?$/.test(s)?s:null;
};
const documented=['id','categoryId','categoryName','platform','name','description','unitPrice','prices'];
const supplemental=['specification','currency','stock','deliveryMethod'];
export function normalizeKuajingZyCatalog(data,{provenance='documented_example',fieldMap={}}={}){
  need(['synthetic','documented_example','authenticated_catalog'].includes(provenance),'PROVENANCE_INVALID');
  need(record(fieldMap)&&Object.keys(fieldMap).every(k=>supplemental.includes(k)&&/^[A-Za-z_][A-Za-z0-9_]{0,49}$/.test(fieldMap[k])),'FIELD_MAP_INVALID');
  // Preserve the upstream read limit even for callers normalizing local fixtures.
  let serialized;try{serialized=JSON.stringify(data);}catch{throw new Error('KUAJINGZY_CATALOG_FORMAT_INVALID');}
  need(typeof serialized==='string'&&Buffer.byteLength(serialized,'utf8')<=262144,'RESPONSE_TOO_LARGE');
  need(record(data)&&data.domain==='mall'&&Array.isArray(data.items),'CATALOG_SCHEMA_UNVERIFIED');
  const seen=new Set();
  const items=data.items.map(raw=>{
    need(record(raw),'CATALOG_ITEM_INVALID');
    const productId=id(raw.id);
    if(productId){need(!seen.has(productId),'CATALOG_DUPLICATE_ID');seen.add(productId);}
    const displayPrices=record(raw.prices)?Object.entries(raw.prices).filter(([c,v])=>/^[A-Z]{3}$/.test(c)&&money(v)!==null).map(([currency,v])=>({currency,amount:money(v)})):[];
    const observed={};
    for(const [canonical,field] of Object.entries(fieldMap)){
      const value=raw[field];
      let scalar=null;
      if(canonical==='stock'&&(Number.isSafeInteger(value)&&value>=0||typeof value==='boolean'))scalar=value;
      if(canonical==='currency'&&typeof value==='string'&&/^[A-Z]{3}$/.test(value))scalar=value;
      if(canonical==='specification'&&typeof value==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(value))scalar=value;
      if(canonical==='deliveryMethod'&&typeof value==='string'&&['pin','code','digital_code','manual','automatic','account'].includes(value.toLowerCase()))scalar=value;
      observed[canonical]={field,present:Object.hasOwn(raw,field),type:value===null?'null':typeof value,value:scalar,contractVerified:false};
      // Do not pass through arbitrary stock/delivery payloads, URLs or secrets.
    }
    const reasons=['FINAL_FEE_INCLUSIVE_COST_UNVERIFIED','STOCK_CONTRACT_UNVERIFIED','DELIVERY_CONTRACT_UNVERIFIED','RESELL_PERMISSION_UNVERIFIED'];
    if(provenance!=='authenticated_catalog')reasons.push('NOT_A_LIVE_OBSERVATION');
    const name=text(raw.name)?raw.name:null;
    if(!productId||!name)reasons.push('PRODUCT_IDENTITY_MISSING');
    return Object.freeze({productId,name,categoryId:id(raw.categoryId),categoryName:text(raw.categoryName)?raw.categoryName:null,
      platform:text(raw.platform)?raw.platform:null,displayUnitPrice:money(raw.unitPrice),displayPrices,
      provenance,identityComplete:Boolean(productId&&name),observed,
      documentedExampleFields:documented.filter(k=>Object.hasOwn(raw,k)),
      unverifiedFieldNames:Object.keys(raw).filter(k=>!documented.includes(k)&&/^[A-Za-z_][A-Za-z0-9_]{0,49}$/.test(k)),
      automaticSaleAllowed:false,purchaseEnabled:false,blockReasons:reasons});
  });
  return Object.freeze({items,productCount:items.length,fullCatalogVerified:false,purchaseEnabled:false});
}
export function prepareKuajingZySkuCandidate({websiteProductId,websiteSkuId,skuProductId,skuCode,catalogItem,expectedSupplierProductId}={}){
  need(id(websiteProductId)&&id(websiteSkuId)&&websiteProductId===skuProductId&&text(skuCode),'SKU_OWNER_MISMATCH');
  need(catalogItem?.identityComplete===true&&id(catalogItem.productId)&&catalogItem.productId===expectedSupplierProductId,'SKU_SUPPLIER_IDENTITY_MISMATCH');
  const identity={supplier:'kuajingzy',websiteProductId,websiteSkuId,skuCode,supplierProductId:catalogItem.productId};
  const metadataPatch=Object.freeze({supplier_binding_candidate:Object.freeze({supplier:'kuajingzy',provider_key:'kuajingzy',
    supplier_product_id:catalogItem.productId,supplier_binding_status:'draft',supplier_auto_purchase_enabled:false,
    supplier_cost_verified:false,supplier_price_verified:false})});
  return Object.freeze({...identity,metadataPatch,bindingFingerprint:createHash('sha256').update(JSON.stringify(identity)).digest('hex'),
    bindingStatus:'candidate_unverified',specificationContractVerified:false,automaticPurchaseEnabled:false,saleEnabled:false});
}
export function prepareKuajingZySkuCandidates(inputs){
  need(Array.isArray(inputs),'SKU_CANDIDATES_INVALID');
  const seen=new Set();return inputs.map(input=>{
    const candidate=prepareKuajingZySkuCandidate(input);
    need(!seen.has(candidate.websiteSkuId),'DUPLICATE_SKU_BINDING');seen.add(candidate.websiteSkuId);return candidate;
  });
}
