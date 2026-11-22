import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {authorizeKuajingZyStorefrontOrderCore} from './storefront-core.mjs';
import {KUAJINGZY_PURCHASE_RELEASE_ENABLED} from './purchase-policy.mjs';
import {createKuajingZyServerClient} from './purchase-server';

export async function authorizeKuajingZyStorefrontOrder(service:SupabaseClient,productId:string,skuId:string|null,quantity:number,userId:string,paymentMethod:string) {
  const read=async(table:string,id:string,parent?:string)=>{
    const fields=table==='products'?'id,status,stock,delivery_type,metadata':'id,product_id,status,stock,delivery_type,metadata';
    let query=service.from(table).select(fields).eq('id',id);
    if(parent) query=query.eq('product_id',parent);
    const {data,error}=await query.maybeSingle();
    if(error)throw new Error('KUAJINGZY_ORDER_UNAVAILABLE');return data;
  };
  return authorizeKuajingZyStorefrontOrderCore({productId,skuId,quantity,userId,paymentMethod,
    loadProduct:(id:string)=>read('products',id),loadSku:(id:string,sku:string)=>read('product_skus',sku,id),
    env:process.env,releaseGate:KUAJINGZY_PURCHASE_RELEASE_ENABLED,
    readFresh:async(id:string)=>{
      const getOnly:typeof fetch=async(input,init)=>{
        const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
        if((init?.method||'GET').toUpperCase()!=='GET'||url.origin!=='https://888.kuajing.one'||url.pathname!=='/api/open/v1/catalog/mall')throw new Error('KUAJINGZY_READONLY_REQUIRED');
        return fetch(input,{...init,redirect:'error'});
      };
      return createKuajingZyServerClient(process.env,getOnly).getProduct(id);
    }});
}
