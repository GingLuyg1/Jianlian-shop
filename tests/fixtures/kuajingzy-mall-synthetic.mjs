// Independently authored synthetic data; NEVER copy actual provider delivery.
// Public product/SKU identity is the one real-contract-tested path.
export const ITEM='imp_8f97c91003b23347934cb14e',SKU='9';
export const SYNTHETIC_SECRET='SYNTHETIC_PRIVATE_DELIVERY_NOT_A_REAL_ACCOUNT';
export function syntheticOrder(patch={}) {
  return {id:'synthetic_order_1',domain:'mall',itemId:ITEM,skuId:SKU,quantity:1,
    currency:'CNY',amount:0.09,status:'completed',
    refund:{status:'none',amount:0,currency:'CNY'},delivery:SYNTHETIC_SECRET,...patch};
}
export function syntheticProduct(patch={}) {
  return {item:{id:ITEM,variants:[{id:SKU,stock:10,minimum:1,maximum:20,unitPrice:0.09,prices:{CNY:0.09}}],...patch},
    pricing:{memberDiscount:1,currency:'CNY'}};
}
export function syntheticCandidate(patch={}) {
  return {orderId:'00000000-0000-4000-8000-000000000001',orderItemId:'00000000-0000-4000-8000-000000000002',quantity:1,
    binding:{supplier:'kuajingzy',productId:ITEM,sku:SKU,websiteProductId:'00000000-0000-4000-8000-000000000003',
      websiteSkuId:'00000000-0000-4000-8000-000000000004',maxUnitCost:'0.10',minUnitProfit:'0.01',minMarginBps:100,enabled:true},
    bindingInvalid:false,orderFields:{},
    financials:{source:'verified_paid_order_allocation',orderId:'00000000-0000-4000-8000-000000000001',
      orderItemId:'00000000-0000-4000-8000-000000000002',currency:'CNY',paymentState:'paid',paidItemAmount:'1.00',paymentFee:'0.01',otherFees:'0.00',checkedAt:new Date().toISOString()},
    ...patch};
}
export const syntheticEnvironment=()=>({SUPPLIER_AUTO_PURCHASE_ENABLED:'true',KUAJINGZY_REAL_PURCHASE_ENABLED:'true',KUAJINGZY_MAX_ORDER_COST_CNY:'1.00'});

export const CANARY_USER='00000000-0000-4000-8000-000000000090';
export const CANARY_PRODUCT='ab4930de-5eef-4a40-9362-83ed6da9ea71';
export const CANARY_SKU='c34de5ce-bd2a-4356-aa2a-ca7ed4c3e4cd';
export const CANARY_ITEM='imp_8f97c91003b23347934cb14e';
export const CANARY_VARIANT='9';
export const syntheticCanaryEnvironment=()=>({...syntheticEnvironment(),
  KUAJINGZY_CANARY_USER_ID:CANARY_USER,KUAJINGZY_MAX_ORDER_COST_CNY:'0.10'});
