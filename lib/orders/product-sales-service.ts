import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 在订单支付成功或交付时原子更新所购商品的销量 (1件+1, 2件+2)
 */
export async function recordOrderProductSales(
  supabase: SupabaseClient,
  orderId: string
): Promise<{ ok: boolean; updatedCount: number }> {
  try {
    if (!orderId) return { ok: false, updatedCount: 0 };

    // 检查该订单项及数量
    const { data: items, error: itemsError } = await supabase
      .from("order_items")
      .select("product_id, quantity")
      .eq("order_id", orderId);

    if (itemsError || !items || items.length === 0) {
      return { ok: false, updatedCount: 0 };
    }

    // 汇总各 product_id 的购买总件数
    const productQtyMap = new Map<string, number>();
    for (const item of items) {
      if (!item.product_id) continue;
      const qty = Math.max(1, Number(item.quantity) || 1);
      productQtyMap.set(item.product_id, (productQtyMap.get(item.product_id) ?? 0) + qty);
    }

    let updatedCount = 0;
    for (const [productId, addQty] of Array.from(productQtyMap.entries())) {
      // 查询商品当前 metadata 和销量
      const { data: prod, error: prodError } = await supabase
        .from("products")
        .select("id, metadata")
        .eq("id", productId)
        .maybeSingle();

      if (prodError || !prod) continue;

      const rawMetadata = (prod.metadata && typeof prod.metadata === "object" ? prod.metadata : {}) as Record<string, unknown>;
      const currentSales = Math.max(0, Number(rawMetadata.sales_count ?? rawMetadata.salesCount ?? 0));
      const newSales = currentSales + addQty;

      const updatedMetadata = {
        ...rawMetadata,
        sales_count: newSales,
        salesCount: newSales,
      };

      const { error: updateError } = await supabase
        .from("products")
        .update({ metadata: updatedMetadata })
        .eq("id", productId);

      if (!updateError) {
        updatedCount++;
      }
    }

    return { ok: true, updatedCount };
  } catch (err) {
    console.error("Failed to record product sales for order:", orderId, err);
    return { ok: false, updatedCount: 0 };
  }
}
