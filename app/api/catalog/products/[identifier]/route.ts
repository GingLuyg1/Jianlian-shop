import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { normalizePublicProduct, normalizePublicSku } from "@/lib/supabase/public-catalog";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const PRODUCT_SELECT =
  "id,category_id,name,slug,short_description,description,image_url,price,original_price,stock,delivery_type,status,sort_order,metadata,created_at,updated_at";

const SKU_SELECT =
  "id,product_id,sku_code,sku_title,price,original_price,stock,status,delivery_type,image_url,sort_order,metadata";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

function jsonError(status: number, code: string, message: string, requestId: string) {
  return NextResponse.json(
    { success: false, error: { code, message, request_id: requestId } },
    { status, headers: { "X-Request-ID": requestId } }
  );
}

function isOptionalSkuSchemaError(error: { message?: string } | null) {
  if (!error?.message) return false;
  return /product_skus|schema cache|could not find|does not exist|PGRST/i.test(error.message);
}

export async function GET(
  _request: Request,
  context: { params: { identifier?: string } }
) {
  const requestId = randomUUID();
  const identifier = decodeURIComponent(String(context.params.identifier ?? "")).trim();

  if (!identifier || identifier.length > 160) {
    return jsonError(400, "INVALID_PRODUCT_IDENTIFIER", "商品参数无效", requestId);
  }

  try {
    const supabase = getSupabaseServerClient();
    const isUuid = UUID_RE.test(identifier);
    const queryProduct = (field: "id" | "slug") =>
      supabase.from("products").select(PRODUCT_SELECT).eq(field, identifier).limit(1).maybeSingle();

    let { data: productData, error: productError } = isUuid
      ? await queryProduct("id")
      : await queryProduct("slug");

    if (!productError && !productData && isUuid) {
      const fallback = await queryProduct("slug");
      productData = fallback.data;
      productError = fallback.error;
    }

    if (productError) {
      return jsonError(500, "PRODUCT_DETAIL_QUERY_FAILED", "商品读取失败，请重试", requestId);
    }

    if (!productData) {
      return jsonError(404, "PRODUCT_NOT_FOUND", "商品不存在", requestId);
    }

    const product = normalizePublicProduct(productData as Record<string, unknown>);
    let skuError: string | null = null;
    let skus: ReturnType<typeof normalizePublicSku>[] = [];

    const { data: skuData, error: rawSkuError } = await supabase
      .from("product_skus")
      .select(SKU_SELECT)
      .eq("product_id", product.id)
      .in("status", ["active", "sold_out"])
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (rawSkuError && !isOptionalSkuSchemaError(rawSkuError)) {
      skuError = "规格读取失败，单规格商品仍可继续查看";
    } else if (!rawSkuError) {
      skus = ((skuData ?? []) as Array<Record<string, unknown>>).map(normalizePublicSku);
    }

    return NextResponse.json(
      {
        success: true,
        data: { product, skus, sku_error: skuError },
        request_id: requestId,
      },
      { headers: { "X-Request-ID": requestId } }
    );
  } catch {
    return jsonError(500, "PRODUCT_DETAIL_UNEXPECTED_ERROR", "商品读取失败，请重试", requestId);
  }
}
