import { NextResponse } from "next/server";

import { CACHE_REVALIDATE_SECONDS } from "@/lib/cache/cache-tags";
import { checkRateLimit, getRequestSourceKey } from "@/lib/security/rate-limit";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PRODUCT_STATUSES = ["active", "sold_out"];
const SKU_STATUSES = ["active", "sold_out"];
const MAX_INTERNAL_PRODUCTS = 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

type CategoryRow = {
  id: string;
  parent_id: string | null;
  level: number | null;
  name: string | null;
  slug: string | null;
  sort_order: number | null;
};

type ProductRow = {
  id: string;
  category_id: string | null;
  name: string | null;
  slug: string | null;
  short_description: string | null;
  price: number | string | null;
  original_price: number | string | null;
  stock: number | string | null;
  delivery_type: string | null;
  status: string | null;
  image_url: string | null;
  sort_order: number | null;
};

type SkuRow = {
  id: string;
  product_id: string | null;
  sku_code: string | null;
  sku_title: string | null;
  price: number | string | null;
  original_price: number | string | null;
  stock: number | string | null;
  status: string | null;
  delivery_type: string | null;
  image_url: string | null;
  sort_order: number | null;
};

type ProductView = ProductRow & {
  price: number;
  original_price: number | null;
  stock: number;
  category_path: string;
  has_skus: boolean;
  min_price: number;
  max_price: number;
  effective_stock: number;
  sales_count: number;
};

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const rateLimit = checkRateLimit("catalog_read", getRequestSourceKey(request));
    if (!rateLimit.allowed) return rateLimit.response!;

    const url = new URL(request.url);
    const primaryCategoryId = normalizeCategoryId(url.searchParams.get("primaryCategoryId"));
    const secondaryCategoryId = normalizeCategoryId(url.searchParams.get("secondaryCategoryId"));
    const keyword = normalizeSearch(url.searchParams.get("keyword"));
    const excludeId = normalizeToken(url.searchParams.get("excludeId"));
    const page = clampNumber(url.searchParams.get("page"), 1, 1, 100000);
    const pageSize = clampNumber(url.searchParams.get("pageSize"), 20, 1, 60);

    if (url.searchParams.get("primaryCategoryId") && !primaryCategoryId) {
      return productError("CATEGORY_ID_INVALID", "一级分类参数不正确", requestId, 400);
    }
    if (url.searchParams.get("secondaryCategoryId") && !secondaryCategoryId) {
      return productError("CATEGORY_ID_INVALID", "二级分类参数不正确", requestId, 400);
    }

    const supabase = getSupabaseServerClient();
    const { data: categoryRows, error: categoryError } = await supabase
      .from("categories")
      .select("id,parent_id,level,name,slug,sort_order")
      .order("level", { ascending: true })
      .order("sort_order", { ascending: true });

    if (categoryError) throw categoryError;

    const categories = (categoryRows ?? []) as CategoryRow[];
    const categoryMap = new Map(categories.map((category) => [category.id, category]));
    const categoryErrorMessage = validateCategorySelection(categoryMap, primaryCategoryId, secondaryCategoryId);
    if (categoryErrorMessage) {
      return productError("CATEGORY_ID_INVALID", categoryErrorMessage, requestId, 400);
    }

    const categoryIds = resolveProductCategoryIds(categories, primaryCategoryId, secondaryCategoryId);
    if ((primaryCategoryId || secondaryCategoryId) && categoryIds.length === 0) {
      return productSuccess([], 0, page, pageSize, requestId);
    }

    const { data: productRows, error: productErrorResult } = await buildProductQuery(supabase, categoryIds);
    if (productErrorResult) throw productErrorResult;

    const products = ((productRows ?? []) as ProductRow[]).filter((product) => {
      if (!product.category_id) return false;
      if (!categoryMap.has(product.category_id)) return false;
      if (excludeId && product.id === excludeId) return false;
      return true;
    });

    const productIds = products.map((product) => product.id);
    const skuRows = await loadSkus(supabase, productIds);
    const skuMap = groupSkusByProduct(skuRows);
    const deliveryTypes = Array.from(
      new Set(products.map((product) => product.delivery_type).filter((value): value is string => Boolean(value)))
    ).sort();

    const visible = products
      .map((product) => enrichProduct(product, skuMap.get(product.id) ?? [], categoryMap))
      .filter((product) => matchSearch(product, skuMap.get(product.id) ?? [], keyword))
      .sort(compareProducts);

    const total = visible.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const from = (safePage - 1) * pageSize;
    const paged = visible.slice(from, from + pageSize);

    return productSuccess(paged, total, safePage, pageSize, requestId, totalPages, deliveryTypes);
  } catch (error) {
    console.error("[Catalog Products]", { requestId, message: safeErrorMessage(error) });
    return productError(
      isSchemaError(error) ? "PRODUCT_CATALOG_SCHEMA_MISSING" : "PRODUCT_LIST_FAILED",
      "商品读取失败，请稍后重试",
      requestId,
      500
    );
  }
}

function buildProductQuery(supabase: ReturnType<typeof getSupabaseServerClient>, categoryIds: string[]) {
  let query = supabase
    .from("products")
    .select("id,category_id,name,slug,short_description,price,original_price,stock,status,delivery_type,image_url,sort_order")
    .in("status", PRODUCT_STATUSES)
    .order("sort_order", { ascending: true })
    .limit(MAX_INTERNAL_PRODUCTS);

  if (categoryIds.length > 0) query = query.in("category_id", categoryIds);
  return query;
}

async function loadSkus(supabase: ReturnType<typeof getSupabaseServerClient>, productIds: string[]) {
  if (productIds.length === 0) return [];

  try {
    const { data, error } = await supabase
      .from("product_skus")
      .select("id,product_id,sku_code,sku_title,price,original_price,stock,status,delivery_type,image_url,sort_order")
      .in("product_id", productIds)
      .in("status", SKU_STATUSES)
      .limit(5000);

    if (error) return [];
    return (data ?? []) as SkuRow[];
  } catch {
    return [];
  }
}

function groupSkusByProduct(skus: SkuRow[]) {
  const output = new Map<string, SkuRow[]>();

  for (const sku of skus) {
    if (!sku.product_id) continue;
    const current = output.get(sku.product_id) ?? [];
    current.push(sku);
    output.set(sku.product_id, current);
  }

  return output;
}

function enrichProduct(product: ProductRow, skus: SkuRow[], categoryMap: Map<string, CategoryRow>): ProductView {
  const activeSkus = skus.filter((sku) => sku.status === "active" || sku.status === "sold_out");
  const skuPrices = activeSkus.map((sku) => numberOrZero(sku.price)).filter((price) => Number.isFinite(price));
  const hasSkus = activeSkus.length > 0;
  const minPrice = hasSkus && skuPrices.length > 0 ? Math.min(...skuPrices) : numberOrZero(product.price);
  const maxPrice = hasSkus && skuPrices.length > 0 ? Math.max(...skuPrices) : numberOrZero(product.price);
  const effectiveStock = hasSkus
    ? activeSkus
        .filter((sku) => sku.status === "active")
        .reduce((sum, sku) => sum + Math.max(0, Math.trunc(numberOrZero(sku.stock))), 0)
    : product.status === "sold_out"
      ? 0
      : Math.max(0, Math.trunc(numberOrZero(product.stock)));
  const preferredImage = activeSkus.find((sku) => sku.image_url)?.image_url ?? product.image_url;
  const deliveryType = activeSkus.find((sku) => sku.delivery_type)?.delivery_type ?? product.delivery_type ?? "manual";

  return {
    ...product,
    name: product.name ?? "",
    slug: product.slug ?? "",
    short_description: product.short_description ?? null,
    image_url: preferredImage ?? null,
    price: minPrice,
    original_price: product.original_price === null ? null : numberOrNull(product.original_price),
    stock: effectiveStock,
    delivery_type: deliveryType,
    status: product.status ?? "draft",
    sort_order: Number(product.sort_order ?? 0),
    category_path: getCategoryPath(categoryMap, product.category_id),
    has_skus: hasSkus,
    min_price: minPrice,
    max_price: maxPrice,
    effective_stock: effectiveStock,
    sales_count: 0,
  };
}

function validateCategorySelection(
  categoryMap: Map<string, CategoryRow>,
  primaryCategoryId: string,
  secondaryCategoryId: string
) {
  if (primaryCategoryId) {
    const primary = categoryMap.get(primaryCategoryId);
    if (!primary || primary.level !== 1) return "一级分类不存在";
  }

  if (secondaryCategoryId) {
    const secondary = categoryMap.get(secondaryCategoryId);
    if (!secondary || secondary.level !== 2) return "二级分类不存在";
    if (primaryCategoryId && secondary.parent_id !== primaryCategoryId) {
      return "二级分类不属于当前一级分类";
    }
  }

  return "";
}

function resolveProductCategoryIds(categories: CategoryRow[], primaryCategoryId: string, secondaryCategoryId: string) {
  if (secondaryCategoryId) return [secondaryCategoryId];
  if (!primaryCategoryId) return [];

  const ids = new Set<string>([primaryCategoryId]);
  const walk = (parentId: string) => {
    categories
      .filter((category) => category.parent_id === parentId)
      .forEach((category) => {
        ids.add(category.id);
        walk(category.id);
      });
  };

  walk(primaryCategoryId);
  return Array.from(ids);
}

function matchSearch(product: ProductView, skus: SkuRow[], keyword: string) {
  if (!keyword) return true;

  const haystack = [
    product.name,
    product.slug,
    product.short_description,
    product.category_path,
    ...skus.flatMap((sku) => [sku.sku_code, sku.sku_title]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(keyword.toLowerCase());
}

function compareProducts(a: ProductView, b: ProductView) {
  const stockWeight =
    Number(a.status === "sold_out" || a.effective_stock <= 0) -
    Number(b.status === "sold_out" || b.effective_stock <= 0);
  if (stockWeight !== 0) return stockWeight;
  return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
}

function productSuccess(
  products: ProductView[],
  total: number,
  page: number,
  pageSize: number,
  requestId: string,
  totalPages = Math.max(1, Math.ceil(total / pageSize)),
  deliveryTypes: string[] = []
) {
  const response = NextResponse.json({
    success: true,
    data: { products, total, page, pageSize, totalPages, deliveryTypes },
    request_id: requestId,
  });

  response.headers.set(
    "Cache-Control",
    `public, max-age=${CACHE_REVALIDATE_SECONDS.publicCatalog}, stale-while-revalidate=30`
  );

  return response;
}

function productError(code: string, message: string, requestId: string, status: number) {
  return NextResponse.json(
    {
      success: false,
      error: { code, message, request_id: requestId },
    },
    { status }
  );
}

function getCategoryPath(categoryMap: Map<string, CategoryRow>, categoryId: string | null) {
  if (!categoryId) return "";

  const path: string[] = [];
  const seen = new Set<string>();
  let current = categoryMap.get(categoryId) ?? null;

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current.name ?? "");
    current = current.parent_id ? categoryMap.get(current.parent_id) ?? null : null;
  }

  return path.filter(Boolean).join(" / ");
}

function normalizeCategoryId(value: string | null) {
  const text = (value ?? "").trim();
  if (!text) return "";
  return UUID_PATTERN.test(text) ? text : "";
}

function normalizeSearch(value: string | null) {
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
}

function normalizeToken(value: string | null) {
  return (value ?? "").trim().replace(/[^\w-]/g, "").slice(0, 80);
}

function clampNumber(value: string | null, fallback: number, min: number, max: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(Math.max(Math.trunc(next), min), max);
}

function numberOrZero(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function numberOrNull(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function safeErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }
  return String(error ?? "");
}

function isSchemaError(error: unknown) {
  const message = safeErrorMessage(error);
  const code =
    error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";

  return /schema cache|Could not find the table|product_skus|categories|products/i.test(message) ||
    ["42P01", "42703", "PGRST205"].includes(code);
}
