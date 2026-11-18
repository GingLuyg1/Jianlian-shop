// Public business DTO. Redemption content is intentionally unrepresentable.
export type KuajingZyOrderResult = Readonly<{
  orderCode:string;itemId:string;skuId:string|null;quantity:number;currency:"CNY";
  unitPrice:string|null;totalPrice:string;status:"paid"|"processing"|"completed"|"cancelled";
  refundStatus:"none"|"partial"|"full";refundAmount:string;
  deliveryPresent:boolean;deliveryCount:number;
}>;
export type KuajingZyBinding = Readonly<{
  supplier:"kuajingzy";productId:string;sku:string|null;websiteProductId:string;websiteSkuId:string;
  maxUnitCost:string;minUnitProfit:string;minMarginBps:number;enabled:boolean;
}>;
export type KuajingZyFrozenRequest = Readonly<{key:string;body:string;fingerprint:string}>;
export type KuajingZyExpectedOrder = Readonly<{itemId:string;skuId:string|null;quantity:number;expectedAmount:string}>;
