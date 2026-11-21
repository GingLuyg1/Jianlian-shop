import {readSkuActivationReadiness} from './sku-activation-readiness.mjs';
export async function readProductActivationReadiness(service,product) {
  // Query actual rows; has_skus can be stale and must never authorize a bypass.
  const {data:skus,error}=await service.from('product_skus').select('id,product_id,status,stock,delivery_type,metadata').eq('product_id',product.id);
  if(error)return {ready:false,reasons:['READINESS_CHECK_FAILED']};
  if(!skus?.length)return {ready:product.has_skus!==true,reasons:product.has_skus===true?['NO_ACTIVE_SKU']:[]};
  const active=skus.filter(s=>s.status==='active');
  if(!active.length)return {ready:false,reasons:['NO_ACTIVE_SKU']};
  for(const sku of active) {
    if((sku.delivery_type||product.delivery_type)==='automatic') {
      const result=await readSkuActivationReadiness(service,product,sku);
      if(!result.ready)return {ready:false,reasons:result.reasons};
    }
  }
  return {ready:true,reasons:[]};
}
