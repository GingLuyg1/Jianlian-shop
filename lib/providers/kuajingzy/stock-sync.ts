import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getKuajingZyReadonlyRuntime } from "./production-server";
import {
  buildKuajingZyAvailabilityMetadata,
  parseKuajingZyStockBinding,
  resolveKuajingZyAdvisoryAvailability,
} from "./stock.mjs";

type Row={
  id:string;
  product_id?:string|null;
  status?:string|null;
  stock?:number|null;
  metadata:Record<string,unknown>|null;
};

const metadataOf=(value:unknown):Record<string,unknown> =>
  value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};

export async function syncKuajingZyAvailabilitySnapshot({
  service,
  productId,
  client=getKuajingZyReadonlyRuntime(),
}:{
  service:SupabaseClient;
  productId:string;
  client?:ReturnType<typeof getKuajingZyReadonlyRuntime>;
}) {
  const {data:product,error:productError}=await service
    .from("products").select("id,status,stock,metadata").eq("id",productId).maybeSingle();
  if(productError||!product) return {ok:false as const,code:"PRODUCT_NOT_FOUND",updated:0};

  const {data:skuRows,error:skuError}=await service
    .from("product_skus").select("id,product_id,status,stock,metadata").eq("product_id",productId).order("sort_order");
  if(skuError) return {ok:false as const,code:"SKU_READ_FAILED",updated:0};

  const productRow=product as Row;
  const rows=(skuRows??[]) as Row[];
  if(rows.length===0) return {ok:false as const,code:"WEBSITE_SKU_REQUIRED",updated:0};

  const syncedAt=new Date().toISOString();
  const itemCache=new Map<string,unknown>();
  let updated=0;
  let failures=0;
  let available=0;
  let outOfStock=0;

  const loadItem=async(supplierProductId:string)=>{
    if(itemCache.has(supplierProductId)) return itemCache.get(supplierProductId);
    const result=await client.collectMallCatalog({itemId:supplierProductId,limit:1});
    const items="items" in result?result.items:result.partial.items;
    if(items.length!==1||String(items[0]?.id??"")!==supplierProductId) throw new Error("KUAJINGZY_PRODUCT_NOT_FOUND");
    itemCache.set(supplierProductId,items[0]);
    return items[0];
  };

  for(const row of rows){
    const binding=parseKuajingZyStockBinding(productRow.metadata,row.metadata);
    if(!binding) continue;
    let resolution;
    try {
      resolution=resolveKuajingZyAdvisoryAvailability(await loadItem(binding.supplierProductId),binding);
    } catch {
      resolution={ok:false,code:"SUPPLIER_READ_FAILED",availability:"unknown",stock:null};
    }
    if(resolution.ok){
      if(resolution.availability==="available") available+=1;
      else outOfStock+=1;
    } else failures+=1;
    const nextMetadata=buildKuajingZyAvailabilityMetadata(metadataOf(row.metadata),resolution,syncedAt);
    const {error}=await service.from("product_skus").update({metadata:nextMetadata}).eq("id",row.id).eq("product_id",productId);
    if(error){failures+=1;continue;}
    updated+=1;
  }

  const skuMetadata=(rows.map(row=>metadataOf(row.metadata)));
  const hasBoundSku=rows.some((row,index)=>Boolean(parseKuajingZyStockBinding(productRow.metadata,skuMetadata[index])));
  if(!hasBoundSku) return {ok:false as const,code:"BINDING_NOT_FOUND",updated:0};

  const summary=failures>0?"partial":available>0?"available":outOfStock>0?"out_of_stock":"unknown";
  const parentMetadata={
    ...metadataOf(productRow.metadata),
    supplier_availability_snapshot:summary,
    supplier_stock_sync_attempted_at:syncedAt,
    supplier_stock_synced_at:failures===0?syncedAt:metadataOf(productRow.metadata).supplier_stock_synced_at,
    supplier_stock_stale:failures>0,
    supplier_stock_sync_status:failures>0?"partial":"synced",
    supplier_stock_sync_error:failures>0?"PARTIAL_OR_FAILED":null,
    supplier_stock_snapshot_advisory:true,
  };
  const {error:parentError}=await service.from("products").update({metadata:parentMetadata}).eq("id",productId);
  if(parentError) return {ok:false as const,code:"PRODUCT_SNAPSHOT_WRITE_FAILED",updated,available,outOfStock,failures};

  return {
    ok:failures===0,
    code:failures===0?"SYNCED":"PARTIAL_OR_FAILED",
    updated,available,outOfStock,failures,
    stockMutated:false,
    statusMutated:false,
    purchaseAttempted:false,
  } as const;
}
