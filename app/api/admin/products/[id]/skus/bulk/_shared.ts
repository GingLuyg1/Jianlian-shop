import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildSkuBulkPreview,
  parseSkuBulkOperationRequest,
  type SkuBulkPreview,
} from "@/lib/products/admin-sku-bulk-operations.mjs";
import {
  isAutomaticSkuActivation,
  readSkuActivationReadiness,
} from "@/lib/products/sku-activation-readiness.mjs";

export const BULK_SKU_FIELDS = "id,product_id,sku_code,sku_title,price,original_price,stock,status,delivery_type,image_url,sort_order,metadata,created_at,updated_at";

export function bulkJson(body: unknown, status: number, requestId: string) {
  const response = NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
  });
  return response;
}

export async function readSkuBulkOperation(
  service: SupabaseClient,
  productId: string,
  body: unknown,
): Promise<
  | { ok: true; preview: SkuBulkPreview; skuIds: string[]; skus: Array<Record<string, any>>; product: Record<string, any> }
  | { ok: false; status: number; code: string; message: string }
> {
  const parsed = parseSkuBulkOperationRequest(body);
  if (!parsed.ok) return { ok: false, status: 400, code: parsed.code, message: parsed.message };

  const [{ data: product, error: productError }, { data: skuRows, error: skuError }] = await Promise.all([
    service.from("products").select("id,delivery_type").eq("id", productId).maybeSingle(),
    service.from("product_skus").select(BULK_SKU_FIELDS).eq("product_id", productId).in("id", parsed.skuIds),
  ]);
  if (productError) return { ok: false, status: 500, code: "PRODUCT_READ_FAILED", message: "商品读取失败" };
  if (!product) return { ok: false, status: 404, code: "PRODUCT_NOT_FOUND", message: "商品不存在" };
  if (skuError) return { ok: false, status: 500, code: "SKU_READ_FAILED", message: "SKU 读取失败" };

  const rowsById = new Map((skuRows ?? []).map((sku) => [String(sku.id), sku]));
  if (rowsById.size !== parsed.skuIds.length || parsed.skuIds.some((id) => !rowsById.has(id))) {
    return {
      ok: false,
      status: 409,
      code: "BULK_SKU_OWNERSHIP_MISMATCH",
      message: "部分 SKU 不存在或不属于当前商品，整个批次已阻止",
    };
  }
  const skus = parsed.skuIds.map((id) => rowsById.get(id)!);
  const readinessBySku: Record<string, any> = {};
  const activationGuardBySku: Record<string, boolean> = {};
  if (parsed.action === "activate") {
    await Promise.all(skus.map(async (sku) => {
      const id = String(sku.id);
      activationGuardBySku[id] = isAutomaticSkuActivation(sku.status, "active", product, sku);
      readinessBySku[id] = await readSkuActivationReadiness(service, product, sku);
    }));
  }

  return {
    ok: true,
    preview: buildSkuBulkPreview({ action: parsed.action, skus, readinessBySku, activationGuardBySku }),
    skuIds: parsed.skuIds,
    skus,
    product,
  };
}
