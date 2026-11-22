import {parseKuajingZyBinding,assertKuajingZyPurchaseGates,inspectKuajingZyProduct,cny} from './purchase-policy.mjs';
import {parseKuajingZyCny} from './mall-order-contract.mjs';
import {assertKuajingZyCanaryScope} from './canary-scope.mjs';
export async function authorizeKuajingZyStorefrontOrderCore({productId,skuId,quantity,userId,paymentMethod,loadProduct,loadSku,readFresh,env={},releaseGate=false}) {
  const product=await loadProduct(productId);
  const sku=skuId?await loadSku(productId,skuId):null;
  const metadata={...(product?.metadata||{}),...(sku?.metadata||{})};
  if(metadata.supplier!=='kuajingzy') return {applicable:false};
  const reject=()=>{throw new Error('KUAJINGZY_ORDER_UNAVAILABLE');};
  try {
    if(!product||product.status!=='active'||!skuId||!sku||sku.id!==skuId||sku.product_id!==productId
      ||sku.status!=='active'||(sku.delivery_type||product.delivery_type)!=='automatic'
      ||sku.stock!==1)reject();
    const binding=parseKuajingZyBinding({...metadata,website_product_id:productId,website_sku_id:skuId},productId,skuId);
    const cap=assertKuajingZyPurchaseGates({releaseGate,env,binding});
    assertKuajingZyCanaryScope({orderUserId:userId,paymentMethod,binding,quantity},env,cap);
    // Gates always precede network. Fresh GET is advisory, not a reservation.
    const {item,pricing}=await readFresh(binding.productId);
    const checked=inspectKuajingZyProduct({item,pricing,candidate:{binding,quantity}});
    const variant=binding.sku===null?item:item.variants.find(v=>v.id===binding.sku);
    if(parseKuajingZyCny(cny(variant.unitPrice))>parseKuajingZyCny(binding.maxUnitCost))reject();
    if(parseKuajingZyCny(cny(checked.expectedAmount))>cap)reject();
    return {applicable:true};
  } catch {return reject();}
}
