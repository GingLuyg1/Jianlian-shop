import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { normalizePublicProduct, normalizePublicSku } from "@/lib/supabase/public-catalog";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const PRODUCT_SELECT =
  "id,category_id,name,slug,short_description,description,image_url,price,original_price,stock,delivery_type,status,sort_order,metadata,created_at,updated_at";

const SKU_SELECT =
  "id,product_id,sku_code,sku_title,price,original_price,stock,status,delivery_type,image_url,sort_order,metadata";

const PRODUCT_LOOKUP_SELECT = "id,slug,status";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VISIBLE_PRODUCT_STATUSES = ["active", "sold_out"];

type ProductDetailRow = Record<string, unknown>;

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

async function findVisibleProductSlugById(
  supabase: { from: (table: string) => any },
  identifier: string
) {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_LOOKUP_SELECT)
    .in("status", VISIBLE_PRODUCT_STATUSES)
    .limit(2000);

  if (error) return { slug: null, error };

  const product = ((data ?? []) as ProductDetailRow[]).find(
    (row) => String(row.id).toLowerCase() === identifier.toLowerCase()
  );

  return { slug: product?.slug ? String(product.slug) : null, error: null };
}

async function findVisibleProductSlugByCatalogApi(request: Request, identifier: string) {
  const origin = new URL(request.url).origin;
  let totalPages = 1;

  for (let page = 1; page <= totalPages && page <= 50; page += 1) {
    const url = new URL("/api/catalog/products", origin);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", "60");

    const response = await fetch(url.toString(), { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | { success: true; data?: { products?: Array<{ id?: unknown; slug?: unknown }>; totalPages?: number } }
      | { success: false }
      | null;

    const data = payload?.success ? payload.data : null;
    const products = data?.products;
    if (!response.ok || !payload?.success || !Array.isArray(products)) return null;

    totalPages = Math.max(1, Number(data?.totalPages ?? 1));
    const product = products.find(
      (row) => String(row.id).toLowerCase() === identifier.toLowerCase()
    );

    if (product?.slug) return String(product.slug);
  }

  return null;
}
export async function GET(
  request: Request,
  context: { params: { identifier?: string } }
) {
  const requestId = randomUUID();
  const identifier = decodeURIComponent(String(context.params.identifier ?? "")).trim();

  if (!identifier || identifier.length > 160) {
    return jsonError(400, "INVALID_PRODUCT_IDENTIFIER", "Invalid product identifier", requestId);
  }

  try {
    const supabase = getSupabaseServerClient();
    const isUuid = UUID_RE.test(identifier);
    const queryProduct = (field: "id" | "slug", value = identifier) =>
      supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq(field, value)
        .in("status", VISIBLE_PRODUCT_STATUSES)
        .limit(1)
        .maybeSingle();

    let { data: productData, error: productError } = isUuid
      ? await queryProduct("id")
      : await queryProduct("slug");

    if (!productError && !productData && isUuid) {
      const fallback = await queryProduct("slug");
      productData = fallback.data;
      productError = fallback.error;
    }

    if (!productError && !productData && isUuid) {
      const fallback = await findVisibleProductSlugById(supabase, identifier);
      productError = fallback.error;
      const fallbackSlug = fallback.slug ?? (productError ? null : await findVisibleProductSlugByCatalogApi(request, identifier));
      if (!productError && fallbackSlug) {
        const bySlug = await queryProduct("slug", fallbackSlug);
        productData = bySlug.data;
        productError = bySlug.error;
      }
    }

    if ((productError || !productData) && isUuid) {
      const service = getSupabaseServiceRoleClient();
      if (service) {
        const { data: serviceProduct, error: serviceError } = await service
          .from("products")
          .select(PRODUCT_SELECT)
          .eq("id", identifier)
          .in("status", VISIBLE_PRODUCT_STATUSES)
          .limit(1)
          .maybeSingle();

        if (!serviceError && serviceProduct) {
          productData = serviceProduct;
          productError = null;
        }
      }
    }

    if (productError) {
      return jsonError(500, "PRODUCT_DETAIL_QUERY_FAILED", "Product detail query failed", requestId);
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
      .in("status", VISIBLE_PRODUCT_STATUSES)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (rawSkuError && !isOptionalSkuSchemaError(rawSkuError)) {
      skuError = "SKU query failed";
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
    return jsonError(500, "PRODUCT_DETAIL_UNEXPECTED_ERROR", "Product detail query failed", requestId);
  }
}
