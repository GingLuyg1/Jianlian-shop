import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { normalizePublicProduct, normalizePublicSku } from "@/lib/supabase/public-catalog";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getRequestSourceKey } from "@/lib/security/rate-limit";
import {
  buildEffectiveCategoryVisibility,
  isProductEffectivelyVisible,
} from "@/lib/catalog/effective-category-visibility.mjs";

const PRODUCT_SELECT =
  "id,category_id,name,slug,short_description,description,image_url,price,original_price,stock,has_skus,delivery_type,status,sort_order,created_at,updated_at";

const SKU_SELECT =
  "id,product_id,sku_code,sku_title,price,original_price,stock,status,delivery_type,image_url,sort_order";

const PRODUCT_LOOKUP_SELECT = "id,slug,status";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VISIBLE_PRODUCT_STATUSES = ["active", "sold_out"];

// Short-TTL in-memory caches ONLY for non-transactional display metadata (sales count & category visibility).
// Product price, stock, status, and SKUs are ALWAYS read fresh from Postgres.
const SALES_COUNT_TTL_MS = 60_000;
const SALES_COUNT_CACHE = new Map<string, { paidQty: number; savedAt: number }>();
const CATEGORY_VISIBILITY_TTL_MS = 30_000;
let cachedCategoryVisibility: { map: Map<string, boolean>; savedAt: number } | null = null;

function getCachedPaidQty(productId: string, now = Date.now()): number | null {
  const hit = SALES_COUNT_CACHE.get(productId);
  if (!hit) return null;
  if (now - hit.savedAt > SALES_COUNT_TTL_MS) {
    SALES_COUNT_CACHE.delete(productId);
    return null;
  }
  return hit.paidQty;
}

function setCachedPaidQty(productId: string, paidQty: number, now = Date.now()) {
  if (SALES_COUNT_CACHE.size >= 500) {
    const oldest = SALES_COUNT_CACHE.keys().next().value;
    if (oldest) SALES_COUNT_CACHE.delete(oldest);
  }
  SALES_COUNT_CACHE.set(productId, { paidQty, savedAt: now });
}

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

export async function GET(
  request: Request,
  context: { params: Promise<{ identifier?: string }> }
) {
  const rateLimit = checkRateLimit("catalog_read", `product_detail:${getRequestSourceKey(request)}`);
  if (!rateLimit.allowed) return rateLimit.response!;

  const requestId = randomUUID();
  const identifier = decodeURIComponent(String((await context.params).identifier ?? "")).trim();

  if (!identifier || identifier.length > 160) {
    return jsonError(400, "INVALID_PRODUCT_IDENTIFIER", "Invalid product identifier", requestId);
  }

  try {
    const supabase = getSupabaseServerClient();
    // This read is independent of UUID/slug resolution. Keep its error local
    // until a product exists, preserving 404/fallback behavior and never
    // reading SKUs or publishing a product before visibility is verified.
    const nowMs = Date.now();
    const hasFreshCategoryVisibility =
      cachedCategoryVisibility && nowMs - cachedCategoryVisibility.savedAt <= CATEGORY_VISIBILITY_TTL_MS;
    const categoryRead = hasFreshCategoryVisibility
      ? Promise.resolve({ data: null, error: null, cachedMap: cachedCategoryVisibility!.map })
      : Promise.resolve()
          .then(() => supabase.from("categories").select("id,parent_id,level,is_active"))
          .then((res) => ({ ...res, cachedMap: null as Map<string, boolean> | null }))
          .catch((error: unknown) => ({ data: null, error, cachedMap: null as Map<string, boolean> | null }));
    const SLUG_ALIASES: Record<string, string> = {
      "sim-001": "giffgaff-sim-blank",
      "sim-002": "giffgaff-sim-5gbp",
      "sim-003": "giffgaff-sim-active-15gbp",
    };
    const resolvedIdentifier = SLUG_ALIASES[identifier.toLowerCase()] || identifier;
    const isUuid = UUID_RE.test(resolvedIdentifier);
    const queryProduct = (field: "id" | "slug", value = resolvedIdentifier) =>
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

    if (!productError && !productData && resolvedIdentifier !== identifier) {
      const fallbackOriginal = await queryProduct("slug", identifier);
      if (fallbackOriginal.data) {
        productData = fallbackOriginal.data;
        productError = fallbackOriginal.error;
      }
    }

    if (!productError && !productData && isUuid) {
      const fallback = await queryProduct("slug");
      productData = fallback.data;
      productError = fallback.error;
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

    const { data: categoryRows, error: categoryError, cachedMap } = await categoryRead;
    if (!cachedMap && categoryError) {
      return jsonError(500, "PRODUCT_CATEGORY_QUERY_FAILED", "Product detail query failed", requestId);
    }
    const categoryVisibility =
      cachedMap ??
      (() => {
        const built = buildEffectiveCategoryVisibility(
          ((categoryRows ?? []) as Array<Record<string, unknown>>).map((row) => ({
            id: String(row.id),
            parent_id: row.parent_id ? String(row.parent_id) : null,
            level: Number(row.level ?? 1),
            is_active: typeof row.is_active === "boolean" ? row.is_active : null,
          }))
        );
        cachedCategoryVisibility = { map: built, savedAt: Date.now() };
        return built;
      })();
    if (!isProductEffectivelyVisible(productData as Record<string, unknown>, categoryVisibility)) {
      return jsonError(404, "PRODUCT_NOT_FOUND", "商品不存在", requestId);
    }

    const product = normalizePublicProduct(productData as Record<string, unknown>);
    const service = getSupabaseServiceRoleClient();
    const skuReadPromise = supabase
      .from("product_skus")
      .select(SKU_SELECT)
      .eq("product_id", product.id)
      .in("status", VISIBLE_PRODUCT_STATUSES)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    const cachedPaidQty = getCachedPaidQty(product.id);
    const enrichmentPromise = service
      ? Promise.all([
          cachedPaidQty !== null
            ? Promise.resolve({ data: null, cachedPaidQty })
            : service
                .from("order_items")
                .select("quantity,orders!inner(payment_status,refund_status)")
                .eq("product_id", product.id)
                .eq("orders.payment_status", "paid")
                .eq("orders.refund_status", "none")
                .limit(5000)
                .then((res) => ({ data: res.data, cachedPaidQty: null as number | null })),
          service
            .from("products")
            .select("metadata")
            .eq("id", product.id)
            .maybeSingle(),
        ]).catch(() => null)
      : Promise.resolve(null);

    const [skuResult, enrichment] = await Promise.all([skuReadPromise, enrichmentPromise]);

    if (enrichment) {
      try {
        const [salesRes, { data: metaRow }] = enrichment;
        const meta = metaRow?.metadata && typeof metaRow.metadata === "object" && !Array.isArray(metaRow.metadata)
          ? (metaRow.metadata as Record<string, unknown>)
          : null;
        const boost = Math.max(0, Math.trunc(Number(meta?.sales_boost ?? meta?.salesCount ?? 0) || 0));
        const deliveryMode = typeof meta?.delivery_mode === "string" ? meta.delivery_mode : null;
        const paidQty =
          salesRes.cachedPaidQty !== null
            ? salesRes.cachedPaidQty
            : (() => {
                const computed = (salesRes.data ?? []).reduce((sum, r) => {
                  const q = Number((r as { quantity?: unknown }).quantity ?? 0);
                  return Number.isSafeInteger(q) && q > 0 ? sum + q : sum;
                }, 0);
                setCachedPaidQty(product.id, computed);
                return computed;
              })();
        product.sales_count = boost + paidQty;
        if (deliveryMode) {
          product.metadata = {
            ...(product.metadata ?? {}),
            delivery_mode: deliveryMode,
          };
        }
      } catch {
        // Best-effort sales enrichment
      }
    }
    let skuError: string | null = null;
    let skus: ReturnType<typeof normalizePublicSku>[] = [];

    const { data: skuData, error: rawSkuError } = skuResult;

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
