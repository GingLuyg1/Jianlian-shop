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

export async function syncSharedSkuCodeInventory(
  service: SupabaseClient,
  sourceSkuIds: string[]
) {
  const ids = Array.from(new Set(sourceSkuIds.map((id) => String(id ?? "").trim()).filter(Boolean)));
  if (ids.length === 0) return;

  try {
    const { data: sourceSkus, error } = await service
      .from("product_skus")
      .select("id,product_id,sku_code,stock")
      .in("id", ids);
    if (error || !sourceSkus || sourceSkus.length === 0) return;

    const affectedProductIds = new Set<string>();
    for (const source of sourceSkus) {
      const rawCode = typeof source.sku_code === "string" ? source.sku_code.trim() : "";
      if (!rawCode) continue;
      const stock = Math.max(0, Math.trunc(Number(source.stock ?? 0)));

      const { data: siblingSkus, error: siblingError } = await service
        .from("product_skus")
        .select("id,product_id,stock")
        .ilike("sku_code", rawCode)
        .neq("id", source.id);
      if (siblingError || !siblingSkus || siblingSkus.length === 0) continue;

      const toUpdate = siblingSkus.filter((row) => Number(row.stock ?? -1) !== stock);
      if (toUpdate.length === 0) continue;

      await service
        .from("product_skus")
        .update({ stock })
        .in(
          "id",
          toUpdate.map((row) => String(row.id))
        );

      for (const row of toUpdate) {
        if (row.product_id) affectedProductIds.add(String(row.product_id));
      }
    }

    for (const pid of Array.from(affectedProductIds)) {
      await syncSkuProductSummary(service, pid).catch(() => null);
    }
  } catch {
    // Shared stock propagation is best-effort and must not fail the primary transaction.
  }
}
