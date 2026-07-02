import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  DeliveryMethod,
  Product,
  ProductCategory,
  ProductType,
  StockStatus,
} from "@/lib/types";

export const FRONTEND_ACTIVE_PRODUCT_STATUS = "active";
export const FRONTEND_VISIBLE_PRODUCT_STATUSES = ["active", "sold_out"];

export type PublicCategory = {
  id: string;
  parent_id: string | null;
  level: 1 | 2 | 3;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  sort_order: number;
  status?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type PublicProductRow = {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  image_url: string | null;
  price: number;
  original_price: number | null;
  stock: number;
  delivery_type: string;
  status: string;
  sort_order: number;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

export type PublicCatalogProductRow = PublicProductRow & {
  category_path?: string | null;
  has_skus?: boolean;
  min_price?: number | null;
  max_price?: number | null;
  effective_stock?: number | null;
  sales_count?: number | null;
};

export type PublicProductSkuRow = {
  id: string;
  product_id: string;
  sku_code: string | null;
  sku_title: string | null;
  price: number;
  original_price: number | null;
  stock: number;
  status: string;
  delivery_type: string | null;
  image_url: string | null;
  sort_order: number;
  metadata: Record<string, unknown> | null;
};

export type PublicProductDetail = {
  product: PublicProductRow;
  skus: PublicProductSkuRow[];
  sku_error?: string | null;
};

export type CatalogProductQuery = {
  primaryCategoryId?: string;
  secondaryCategoryId?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
  excludeId?: string;
};

export type CatalogProductResult = {
  products: PublicCatalogProductRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  deliveryTypes: string[];
};

type CatalogProductResponse =
  | { success: true; data: CatalogProductResult; request_id: string }
  | { success: false; error: { code: string; message: string; request_id: string } };

export type PublicCatalogConfig = {
  productCategory: ProductCategory;
  primarySlugs: string[];
  primaryNames: string[];
};

const productSelect =
  "id,category_id,name,slug,short_description,description,image_url,price,original_price,stock,delivery_type,status,sort_order,metadata,created_at,updated_at";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

function normalizeNumber(value: unknown, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizeCategory(row: Record<string, unknown>): PublicCategory {
  const rawLevel = normalizeNumber(row.level, 1);
  return {
    id: String(row.id),
    parent_id: row.parent_id ? String(row.parent_id) : null,
    level: rawLevel === 2 || rawLevel === 3 ? rawLevel : 1,
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    icon: row.icon ? String(row.icon) : null,
    description: row.description ? String(row.description) : null,
    sort_order: normalizeNumber(row.sort_order),
    status: row.status ? String(row.status) : null,
    is_active: typeof row.is_active === "boolean" ? Boolean(row.is_active) : null,
    created_at: row.created_at ? String(row.created_at) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
  };
}

export function normalizePublicProduct(row: Record<string, unknown>): PublicProductRow {
  return {
    id: String(row.id),
    category_id: row.category_id ? String(row.category_id) : null,
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    short_description: row.short_description ? String(row.short_description) : null,
    description: row.description ? String(row.description) : null,
    image_url: row.image_url ? String(row.image_url) : null,
    price: normalizeNumber(row.price),
    original_price:
      row.original_price === null || row.original_price === undefined
        ? null
        : normalizeNumber(row.original_price),
    stock: normalizeNumber(row.stock),
    delivery_type: row.delivery_type ? String(row.delivery_type) : "manual",
    status: row.status ? String(row.status) : "draft",
    sort_order: normalizeNumber(row.sort_order),
    metadata: row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : null,
    created_at: row.created_at ? String(row.created_at) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
  };
}

export function normalizePublicSku(row: Record<string, unknown>): PublicProductSkuRow {
  return {
    id: String(row.id),
    product_id: String(row.product_id),
    sku_code: row.sku_code ? String(row.sku_code) : null,
    sku_title: row.sku_title ? String(row.sku_title) : null,
    price: normalizeNumber(row.price),
    original_price:
      row.original_price === null || row.original_price === undefined
        ? null
        : normalizeNumber(row.original_price),
    stock: normalizeNumber(row.stock),
    status: row.status ? String(row.status) : "draft",
    delivery_type: row.delivery_type ? String(row.delivery_type) : null,
    image_url: row.image_url ? String(row.image_url) : null,
    sort_order: normalizeNumber(row.sort_order),
    metadata: row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : null,
  };
}

export function getErrorText(error: unknown, fallback = "操作失败，请稍后重试") {
  console.error("[Public Catalog]", error);
  return fallback;
}

export function isPublicCategoryEnabled(category: PublicCategory) {
  if (typeof category.is_active === "boolean") return category.is_active;
  return category.status !== "inactive";
}

export async function listPublicCategories() {
  const { data, error } = await getSupabaseBrowserClient()
    .from("categories")
    .select("*")
    .order("level", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(getErrorText(error, "分类读取失败，请检查 RLS 读取策略"));

  return ((data ?? []) as Array<Record<string, unknown>>)
    .map(normalizeCategory)
    .filter(isPublicCategoryEnabled);
}

export async function listActiveProductsByCategory(categoryId: string) {
  return listActiveProductsByCategoryIds([categoryId]);
}

export async function listActiveProductsByCategoryIds(categoryIds: string[]) {
  const ids = Array.from(new Set(categoryIds.filter(Boolean)));
  if (ids.length === 0) return [];

  const { data, error } = await getSupabaseBrowserClient()
    .from("products")
    .select(productSelect)
    .in("category_id", ids)
    .in("status", FRONTEND_VISIBLE_PRODUCT_STATUSES)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw new Error(getErrorText(error, "商品读取失败，请检查 RLS 读取策略"));

  return ((data ?? []) as Array<Record<string, unknown>>).map(normalizePublicProduct);
}

export async function searchPublicCatalogProducts(query: CatalogProductQuery) {
  const params = new URLSearchParams();
  if (query.primaryCategoryId) params.set("primaryCategoryId", query.primaryCategoryId);
  if (query.secondaryCategoryId) params.set("secondaryCategoryId", query.secondaryCategoryId);
  if (query.keyword?.trim()) params.set("keyword", query.keyword.trim());
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.excludeId) params.set("excludeId", query.excludeId);

  const response = await fetch(`/api/catalog/products?${params.toString()}`);
  const payload = (await response.json().catch(() => null)) as CatalogProductResponse | null;

  if (!response.ok || !payload?.success) {
    const errorPayload = payload && !payload.success ? payload.error : null;
    const requestId = errorPayload?.request_id ? `（Request ID: ${errorPayload.request_id}）` : "";
    throw new Error(`${errorPayload?.message ?? "商品读取失败，请稍后重试"}${requestId}`);
  }

  if (!Array.isArray(payload.data?.products)) {
    throw new Error("商品接口返回结构异常，请稍后重试");
  }

  return {
    products: payload.data.products,
    total: payload.data.total ?? 0,
    page: payload.data.page ?? 1,
    pageSize: payload.data.pageSize ?? 20,
    totalPages: payload.data.totalPages ?? 1,
    deliveryTypes: payload.data.deliveryTypes ?? [],
  };
}

export async function getActiveProductByIdOrSlug(identifier: string) {
  return getProductByIdOrSlug(identifier, { activeOnly: true });
}

export async function getProductByIdOrSlug(identifier: string, options: { activeOnly?: boolean } = {}) {
  const supabase = getSupabaseBrowserClient();
  const normalizedIdentifier = identifier.trim();
  const isUuid = UUID_RE.test(normalizedIdentifier);

  const queryBy = (field: "id" | "slug") => {
    let query = supabase.from("products").select(productSelect).eq(field, normalizedIdentifier).limit(1);
    if (options.activeOnly) query = query.eq("status", FRONTEND_ACTIVE_PRODUCT_STATUS);
    return query.maybeSingle();
  };

  let { data, error } = isUuid ? await queryBy("id") : await queryBy("slug");

  if (!error && !data && isUuid) {
    const fallback = await queryBy("slug");
    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw new Error(getErrorText(error, "商品详情读取失败"));

  return data ? normalizePublicProduct(data as Record<string, unknown>) : null;
}

export async function getPublicProductDetail(identifier: string): Promise<PublicProductDetail | null> {
  const encoded = encodeURIComponent(identifier.trim());
  const response = await fetch(`/api/catalog/products/${encoded}`, { cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as
    | { success: true; data: PublicProductDetail }
    | { success: false; error?: { code?: string; message?: string; request_id?: string } }
    | null;

  if (response.status === 404) return null;
  if (!response.ok || !payload?.success) {
    const message = payload && !payload.success ? payload.error?.message : null;
    const requestId =
      payload && !payload.success && payload.error?.request_id
        ? `（Request ID: ${payload.error.request_id}）`
        : "";
    throw new Error(`${message || "商品读取失败，请重试"}${requestId}`);
  }
  return payload.data;
}

export function findPrimaryCategory(categories: PublicCategory[], config: PublicCatalogConfig) {
  const slugSet = new Set(config.primarySlugs.map(normalizeText));
  const nameMatchers = config.primaryNames.map(normalizeText);

  return categories.find((category) => {
    if (category.level !== 1 || !isPublicCategoryEnabled(category)) return false;
    const slug = normalizeText(category.slug);
    const name = normalizeText(category.name);
    return slugSet.has(slug) || nameMatchers.some((matcher) => matcher && name.includes(matcher));
  });
}

export function getChildCategories(categories: PublicCategory[], parentId: string) {
  return categories
    .filter((category) => category.parent_id === parentId && category.level === 2 && isPublicCategoryEnabled(category))
    .sort((first, second) => first.sort_order - second.sort_order || first.name.localeCompare(second.name));
}

export function getDescendantCategoryIds(categories: PublicCategory[], categoryId: string) {
  const ids = new Set<string>([categoryId]);
  const walk = (parentId: string) => {
    categories
      .filter((category) => category.parent_id === parentId && isPublicCategoryEnabled(category))
      .forEach((category) => {
        ids.add(category.id);
        walk(category.id);
      });
  };
  walk(categoryId);
  return Array.from(ids);
}

export function mapPublicProductToProduct(
  row: PublicProductRow | PublicCatalogProductRow,
  productCategory: ProductCategory,
  categoryLabel: string
): Product {
  const hasSkus = Boolean((row as PublicCatalogProductRow).has_skus);
  const effectiveStock =
    typeof (row as PublicCatalogProductRow).effective_stock === "number"
      ? Number((row as PublicCatalogProductRow).effective_stock)
      : row.status === "sold_out"
        ? 0
        : row.stock;
  const minPrice =
    typeof (row as PublicCatalogProductRow).min_price === "number"
      ? Number((row as PublicCatalogProductRow).min_price)
      : row.price;
  const maxPrice =
    typeof (row as PublicCatalogProductRow).max_price === "number"
      ? Number((row as PublicCatalogProductRow).max_price)
      : row.price;
  const stockStatus: StockStatus =
    row.status === "sold_out" || effectiveStock <= 0
      ? "out-of-stock"
      : effectiveStock <= 10
        ? "low-stock"
        : "in-stock";
  const deliveryMethod: DeliveryMethod =
    row.delivery_type === "shipping" ? "physical" : row.delivery_type === "manual" ? "hybrid" : "digital";
  const productType: ProductType = row.delivery_type === "shipping" ? "physical" : "digital";

  return {
    id: row.id,
    name: row.name,
    category: productCategory,
    categoryLabel,
    description: row.short_description ?? row.description ?? "",
    imageUrl: row.image_url,
    originalPrice: row.original_price,
    stock: effectiveStock,
    sortOrder: row.sort_order,
    metadata: { ...(row.metadata ?? {}), slug: row.slug, hasSkus, minPrice, maxPrice },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    price: minPrice,
    currency: "CNY",
    stockStatus,
    stockLabel:
      row.status === "sold_out"
        ? "已售罄"
        : effectiveStock <= 0
          ? "暂时缺货"
          : `库存：${effectiveStock}`,
    processingTime: row.delivery_type === "automatic" ? "自动发货" : "联系客服确认",
    deliveryMethod,
    deliveryLabel: getDeliveryLabel(row.delivery_type),
    productType,
    listingStatus: row.status === FRONTEND_ACTIVE_PRODUCT_STATUS ? "active" : "inactive",
    detail: row.description ?? row.short_description ?? "",
  };
}

export function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

export function getDeliveryLabel(deliveryType: string) {
  if (deliveryType === "automatic") return "自动发货";
  if (deliveryType === "shipping") return "物流发货";
  if (deliveryType === "card") return "卡密交付";
  if (deliveryType === "account") return "账号交付";
  return "人工处理";
}

export function getProductDetailPath(product: { id: string; slug?: string | null }) {
  const identifier = String(product.slug ?? "").trim() || product.id;
  return `/products/${encodeURIComponent(identifier)}`;
}
