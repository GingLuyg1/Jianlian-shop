const SAFE_ID=/^[A-Za-z0-9_-]{1,120}$/;
const SAFE_SKU=/^[A-Za-z0-9_-]{1,80}$/;
const record=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);

export function parseKuajingZyStockBinding(productMetadata, skuMetadata) {
  const product=record(productMetadata)?productMetadata:{};
  const sku=record(skuMetadata)?skuMetadata:{};
  const value=key=>Object.prototype.hasOwnProperty.call(sku,key)?sku[key]:product[key];
  const supplierProductId=value("supplier_product_id");
  const supplierSku=value("supplier_sku");
  if(value("fulfillment_source")!=="supplier"||value("supplier")!=="kuajingzy"
    ||typeof supplierProductId!=="string"||!SAFE_ID.test(supplierProductId)
    ||!(supplierSku===null||(typeof supplierSku==="string"&&SAFE_SKU.test(supplierSku)))) return null;
  return Object.freeze({supplierProductId,supplierSku});
}

export function resolveKuajingZyAdvisoryAvailability(item,binding) {
  if(!record(item)||!binding||item.id!==binding.supplierProductId) {
    return Object.freeze({ok:false,code:"SUPPLIER_PRODUCT_IDENTITY_MISMATCH",availability:"unknown",stock:null});
  }
  if(!Array.isArray(item.variants)) {
    return Object.freeze({ok:false,code:"VARIANT_SCHEMA_INVALID",availability:"unknown",stock:null});
  }
  let target=item;
  if(item.variants.length>0){
    if(binding.supplierSku===null) {
      return Object.freeze({ok:false,code:"SUPPLIER_SKU_REQUIRED",availability:"unknown",stock:null});
    }
    const matches=item.variants.filter(v=>record(v)&&String(v.id??"")===binding.supplierSku);
    if(matches.length!==1) {
      return Object.freeze({ok:false,code:"SUPPLIER_SKU_NOT_FOUND",availability:"unknown",stock:null});
    }
    target=matches[0];
  } else if(binding.supplierSku!==null) {
    return Object.freeze({ok:false,code:"UNEXPECTED_SUPPLIER_SKU",availability:"unknown",stock:null});
  }
  const stock=target.stock;
  if(!Number.isSafeInteger(stock)||stock<0) {
    return Object.freeze({ok:false,code:"SUPPLIER_STOCK_UNKNOWN",availability:"unknown",stock:null});
  }
  return Object.freeze({ok:true,code:"SNAPSHOT_OK",availability:stock>0?"available":"out_of_stock",stock});
}

export function buildKuajingZyAvailabilityMetadata(metadata,resolution,syncedAt) {
  const base=record(metadata)?metadata:{};
  if(resolution?.ok===true) {
    return {
      ...base,
      supplier_stock_snapshot:resolution.stock,
      supplier_availability_snapshot:resolution.availability,
      supplier_stock_synced_at:syncedAt,
      supplier_stock_last_success_at:syncedAt,
      supplier_stock_sync_attempted_at:syncedAt,
      supplier_stock_stale:false,
      supplier_stock_sync_status:"synced",
      supplier_stock_sync_error:null,
      supplier_stock_snapshot_advisory:true,
    };
  }
  return {
    ...base,
    supplier_availability_snapshot:"unknown",
    supplier_stock_sync_attempted_at:syncedAt,
    supplier_stock_stale:true,
    supplier_stock_sync_status:"error",
    supplier_stock_sync_error:resolution?.code??"SUPPLIER_READ_FAILED",
    supplier_stock_snapshot_advisory:true,
  };
}
