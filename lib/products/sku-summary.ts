import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveSkuProductSummary } from "./sku-editor.mjs";

export async function syncSkuProductSummary(service: SupabaseClient, productId: string) {
  // Page explicitly: PostgREST's row cap must not silently truncate the summary.
  const rows: Array<{ status: string; price: number; stock: number }> = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await service.from("product_skus").select("id,status,price,stock").eq("product_id", productId).order("id").range(offset, offset + 499);
    if (error) throw new Error("SKU 汇总读取失败，请重试保存");
    rows.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  const summary = deriveSkuProductSummary(rows);
  const { error } = await service.from("products").update({ stock: summary.stock, has_skus: summary.has_skus, ...(summary.price === null ? {} : { price: summary.price }) }).eq("id", productId);
  if (error) throw new Error("商品价格库存汇总失败，请重试保存");
  return summary;
}
