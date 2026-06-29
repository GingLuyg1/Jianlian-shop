import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PRODUCT_STATUSES = ["active", "sold_out"];
const SKU_STATUSES = ["active", "sold_out"];
const SORT_OPTIONS = new Set(["default", "latest", "price_asc", "price_desc", "sales"]);
const STOCK_OPTIONS = new Set(["all", "in_stock", "low_stock", "sold_out"]);
const MULTI_SKU_OPTIONS = new Set(["all", "yes", "no"]);
const MAX_INTERNAL_PRODUCTS = 1000;

type CategoryRow = {
  id: string;
  parent_id: string | null;
  level: number | null;
  name: string | null;
  slug: string | null;
  sort_order: number | null;
  status?: string | null;
  is_active?: boolean | null;
};

type ProductRow = {
  id: string;
  category_id: string | null;
  name: string | null;
  slug: string | null;
  short_description: string | null;
  description: string | null;
  image_url: string | null;
  price: number | string | null;
  original_price: number | string | null;
  stock: number | string | null;
  delivery_type: string | null;
  status: string | null;
  sort_order: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
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
  try {
    const url = new URL(request.url);
    const categoryIds = normalizeIdList(url.searchParams.get("categoryIds"));
    const search = normalizeSearch(url.searchParams.get("search"));
    const priceMin = normalizePrice(url.searchParams.get("priceMin"));
    const priceMax = normalizePrice(url.searchParams.get("priceMax"));
    const stock = normalizeEnum(url.searchParams.get("stock"), STOCK_OPTIONS, "all");
    const multiSku = normalizeEnum(url.searchParams.get("multiSku"), MULTI_SKU_OPTIONS, "all");
    const sort = normalizeEnum(url.searchParams.get("sort"), SORT_OPTIONS, "default");
    const deliveryType = normalizeToken(url.searchParams.get("deliveryType"));
    const excludeId = normalizeToken(url.searchParams.get("excludeId"));
    const page = clampNumber(url.searchParams.get("page"), 1, 1, 100000);
    const pageSize = clampNumber(url.searchParams.get("pageSize"), 20, 1, 60);

    const supabase = getSupabaseServerClient();
    const [{ data: categoryRows, error: categoryError }, productResult] = await Promise.all([
      supabase
        .from("categories")
        .select("id,parent_id,level,name,slug,sort_order,status,is_active")
        .order("level", { ascending: true })
        .order("sort_order", { ascending: true }),
      buildProductQuery(supabase, categoryIds, deliveryType),
    ]);

    if (categoryError) throw categoryError;
    if (productResult.error) throw productResult.error;

    const categories = ((categoryRows ?? []) as CategoryRow[]).filter(isCategoryEnabled);
    const categoryMap = new Map(categories.map((category) => [category.id, category]));
    const products = ((productResult.data ?? []) as ProductRow[]).filter((product) => {
      if (!product.category_id) return false;
      if (!categoryMap.has(product.category_id)) return false;
      if (excludeId && product.id === excludeId) return false;
      return true;
    });
    const productIds = products.map((product) => product.id);
    const [skuRows, salesMap] = await Promise.all([
      loadSkus(supabase, productIds),
      loadSalesCount(supabase, productIds),
    ]);
    const skuMap = groupSkusByProduct(skuRows);

    const deliveryTypes = Array.from(
      new Set(
        products
          .map((product) => product.delivery_type)
          .filter((value): value is string => Boolean(value))
      )
    ).sort();

    const visible = products
      .map((product) => enrichProduct(product, skuMap.get(product.id) ?? [], categoryMap, salesMap.get(product.id) ?? 0))
      .filter((product) => matchSearch(product, skuMap.get(product.id) ?? [], search))
      .filter((product) => matchPrice(product, priceMin, priceMax))
      .filter((product) => matchStock(product, stock))
      .filter((product) => matchMultiSku(product, multiSku));

    visible.sort((a, b) => compareProducts(a, b, sort));

    const total = visible.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const from = (safePage - 1) * pageSize;
    const paged = visible.slice(from, from + pageSize);

    return NextResponse.json({
      products: paged,
      total,
      page: safePage,
      pageSize,
      totalPages,
      deliveryTypes,
    });
  } catch (error) {
    console.error("[Catalog Products]", error);
    return NextResponse.json(
      {
        error: isMissingTableError(error)
          ? "商品发现相关数据表尚未初始化，请联系管理员执行对应 migration。"
          : "商品搜索失败，请稍后重试。",
        products: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 1,
        deliveryTypes: [],
      },
      { status: 500 }
    );
  }
}

function buildProductQuery(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  categoryIds: string[],
  deliveryType: string
) {
  let query = supabase
    .from("products")
    .select("id,category_id,name,slug,short_description,description,image_url,price,original_price,stock,delivery_type,status,sort_order,metadata,created_at,updated_at")
    .in("status", PRODUCT_STATUSES)
    .limit(MAX_INTERNAL_PRODUCTS);

  if (categoryIds.length > 0) query = query.in("category_id", categoryIds);
  if (deliveryType && deliveryType !== "all") query = query.eq("delivery_type", deliveryType);
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

async function loadSalesCount(supabase: ReturnType<typeof getSupabaseServerClient>, productIds: string[]) {
  const salesMap = new Map<string, number>();
  if (productIds.length === 0) return salesMap;
  try {
    const { data, error } = await supabase
      .from("order_items")
      .select("product_id,quantity,orders!inner(payment_status,status)")
      .in("product_id", productIds)
      .eq("orders.payment_status", "paid")
      .not("orders.status", "in", "(cancelled,failed,refunded)")
      .limit(5000);
    if (error) return salesMap;
    for (const row of (data ?? []) as Array<{ product_id?: string | null; quantity?: number | string | null }>) {
      if (!row.product_id) continue;
      salesMap.set(row.product_id, (salesMap.get(row.product_id) ?? 0) + Math.max(0, Number(row.quantity ?? 1)));
    }
  } catch {
    return salesMap;
  }
  return salesMap;
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

function enrichProduct(
  product: ProductRow,
  skus: SkuRow[],
  categoryMap: Map<string, CategoryRow>,
  salesCount: number
): ProductView {
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
    description: product.description ?? null,
    image_url: preferredImage ?? null,
    price: minPrice,
    original_price: product.original_price === null ? null : numberOrNull(product.original_price),
    stock: effectiveStock,
    delivery_type: deliveryType,
    status: product.status ?? "draft",
    sort_order: Number(product.sort_order ?? 0),
    metadata: product.metadata ?? null,
    category_path: getCategoryPath(categoryMap, product.category_id),
    has_skus: hasSkus,
    min_price: minPrice,
    max_price: maxPrice,
    effective_stock: effectiveStock,
    sales_count: salesCount,
  };
}

function matchSearch(product: ProductView, skus: SkuRow[], search: string) {
  if (!search) return true;
  const haystack = [
    product.name,
    product.slug,
    product.short_description,
    product.description,
    product.category_path,
    ...skus.flatMap((sku) => [sku.sku_code, sku.sku_title]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(search.toLowerCase());
}

function matchPrice(product: ProductView, min: number | null, max: number | null) {
  if (min !== null && product.min_price < min) return false;
  if (max !== null && product.min_price > max) return false;
  return true;
}

function matchStock(product: ProductView, stock: string) {
  if (stock === "all") return true;
  if (stock === "sold_out") return product.status === "sold_out" || product.effective_stock <= 0;
  if (stock === "low_stock") return product.status !== "sold_out" && product.effective_stock > 0 && product.effective_stock <= 10;
  if (stock === "in_stock") return product.status !== "sold_out" && product.effective_stock > 0;
  return true;
}

function matchMultiSku(product: ProductView, multiSku: string) {
  if (multiSku === "yes") return product.has_skus;
  if (multiSku === "no") return !product.has_skus;
  return true;
}

function compareProducts(a: ProductView, b: ProductView, sort: string) {
  const stockWeight = Number(a.status === "sold_out" || a.effective_stock <= 0) - Number(b.status === "sold_out" || b.effective_stock <= 0);
  if (stockWeight !== 0) return stockWeight;

  if (sort === "latest") {
    return dateValue(b.created_at) - dateValue(a.created_at);
  }
  if (sort === "price_asc") {
    return a.min_price - b.min_price || Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
  }
  if (sort === "price_desc") {
    return b.min_price - a.min_price || Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
  }
  if (sort === "sales") {
    return b.sales_count - a.sales_count || Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
  }
  return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) || dateValue(b.created_at) - dateValue(a.created_at);
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

function isCategoryEnabled(category: CategoryRow) {
  if (typeof category.is_active === "boolean") return category.is_active;
  return category.status !== "inactive";
}

function normalizeIdList(value: string | null) {
  return Array.from(new Set((value ?? "").split(",").map((item) => item.trim()).filter(Boolean))).slice(0, 200);
}

function normalizeSearch(value: string | null) {
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
}

function normalizeToken(value: string | null) {
  return (value ?? "").trim().replace(/[^\w-]/g, "").slice(0, 80);
}

function normalizePrice(value: string | null) {
  if (!value) return null;
  const next = Number(value);
  return Number.isFinite(next) && next >= 0 ? next : null;
}

function normalizeEnum(value: string | null, allowed: Set<string>, fallback: string) {
  return value && allowed.has(value) ? value : fallback;
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

function dateValue(value: string | null) {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function isMissingTableError(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  const code =
    error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return /schema cache|Could not find the table|product_skus|order_items|categories|products/i.test(message) || ["42P01", "42703", "PGRST205"].includes(code);
}
