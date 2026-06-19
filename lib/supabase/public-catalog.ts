import { getDeliveryLabel, normalizeProductStatus } from "@/lib/catalog/product-status";
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

export type PublicCatalogConfig = {
  productCategory: ProductCategory;
  primarySlugs: string[];
  primaryNames: string[];
};

export type PublicProductListOptions = {
  categoryIds?: string[];
  search?: string;
  sort?: "default" | "price_asc" | "price_desc" | "newest";
  stock?: "all" | "in_stock" | "out_of_stock" | "sold_out";
  deliveryType?: string;
  page?: number;
  pageSize?: number;
};

export type PublicProductListResult = {
  products: PublicProductRow[];
  count: number;
};

const productSelect =
  "id,category_id,name,slug,short_description,description,image_url,price,original_price,stock,delivery_type,status,sort_order,metadata,created_at,updated_at";

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

function normalizeProduct(row: Record<string, unknown>): PublicProductRow {
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
    status: normalizeProductStatus(row.status ? String(row.status) : "draft"),
    sort_order: normalizeNumber(row.sort_order),
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null,
    created_at: row.created_at ? String(row.created_at) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
  };
}

export function getErrorText(error: unknown, fallback = "操作失败，请稍后重试") {
  const message = (error as { message?: string } | null | undefined)?.message;
  if (!message) return fallback;
  if (/PGRST|schema|relation|JWT|Supabase|PostgREST|fetch failed/i.test(message)) {
    return fallback;
  }
  return message;
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

  if (error) {
    throw new Error(getErrorText(error, "分类读取失败，请稍后重试"));
  }

  return ((data ?? []) as Array<Record<string, unknown>>)
    .map(normalizeCategory)
    .filter(isPublicCategoryEnabled);
}

export async function listFrontendProducts(
  options: PublicProductListOptions = {}
): Promise<PublicProductListResult> {
  const page = Math.max(1, Number(options.page ?? 1));
  const pageSize = Math.max(1, Number(options.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const search = options.search?.trim();

  let query = getSupabaseBrowserClient()
    .from("products")
    .select(productSelect, { count: "exact" })
    .in("status", FRONTEND_VISIBLE_PRODUCT_STATUSES);

  if (options.categoryIds?.length) {
    query = query.in("category_id", options.categoryIds);
  }

  if (search) {
    const safeSearch = search.replace(/[%_]/g, "\\$&");
    query = query.or(
      `name.ilike.%${safeSearch}%,slug.ilike.%${safeSearch}%,short_description.ilike.%${safeSearch}%`
    );
  }

  if (options.stock === "in_stock") {
    query = query.eq("status", "active").gt("stock", 0);
  } else if (options.stock === "out_of_stock") {
    query = query.eq("status", "active").lte("stock", 0);
  } else if (options.stock === "sold_out") {
    query = query.eq("status", "sold_out");
  }

  if (options.deliveryType && options.deliveryType !== "all") {
    query = query.eq("delivery_type", options.deliveryType);
  }

  if (options.sort === "price_asc") {
    query = query.order("price", { ascending: true });
  } else if (options.sort === "price_desc") {
    query = query.order("price", { ascending: false });
  } else if (options.sort === "newest") {
    query = query.order("created_at", { ascending: false });
  } else {
    query = query.order("sort_order", { ascending: true }).order("created_at", { ascending: false });
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    throw new Error(getErrorText(error, "商品读取失败，请稍后重试"));
  }

  return {
    products: ((data ?? []) as Array<Record<string, unknown>>).map(normalizeProduct),
    count: count ?? 0,
  };
}

export async function listActiveProductsByCategory(categoryId: string) {
  const result = await listFrontendProducts({
    categoryIds: [categoryId],
    page: 1,
    pageSize: 100,
  });
  return result.products.filter((product) => product.status === FRONTEND_ACTIVE_PRODUCT_STATUS);
}

export async function getActiveProductByIdOrSlug(identifier: string) {
  return getProductByIdOrSlug(identifier, { activeOnly: true });
}

export async function getProductByIdOrSlug(
  identifier: string,
  options: { activeOnly?: boolean } = {}
) {
  const supabase = getSupabaseBrowserClient();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      identifier
    );

  let baseQuery = supabase.from("products").select(productSelect).limit(1);

  if (options.activeOnly) {
    baseQuery = baseQuery.in("status", FRONTEND_VISIBLE_PRODUCT_STATUSES);
  }

  const { data, error } = isUuid
    ? await baseQuery.eq("id", identifier).maybeSingle()
    : await baseQuery.eq("slug", identifier).maybeSingle();

  if (error) {
    throw new Error(getErrorText(error, "商品详情读取失败，请稍后重试"));
  }

  return data ? normalizeProduct(data as Record<string, unknown>) : null;
}

export function findPrimaryCategory(categories: PublicCategory[], config: PublicCatalogConfig) {
  const slugSet = new Set(config.primarySlugs.map(normalizeText));
  const nameMatchers = config.primaryNames.map(normalizeText);

  return categories.find((category) => {
    if (category.level !== 1 || !isPublicCategoryEnabled(category)) return false;
    const slug = normalizeText(category.slug);
    const name = normalizeText(category.name);
    return (
      slugSet.has(slug) ||
      nameMatchers.some((matcher) => matcher && name.includes(matcher))
    );
  });
}

export function getChildCategories(categories: PublicCategory[], parentId: string) {
  return categories
    .filter((category) => category.parent_id === parentId && isPublicCategoryEnabled(category))
    .sort(
      (first, second) =>
        first.sort_order - second.sort_order ||
        first.name.localeCompare(second.name, "zh-Hans-CN")
    );
}

export function mapPublicProductToProduct(
  row: PublicProductRow,
  productCategory: ProductCategory,
  categoryLabel: string
): Product {
  const stockStatus: StockStatus =
    row.status === "sold_out" || row.stock <= 0
      ? "out-of-stock"
      : row.stock <= 10
        ? "low-stock"
        : "in-stock";
  const deliveryMethod: DeliveryMethod =
    row.delivery_type === "shipping"
      ? "physical"
      : row.delivery_type === "manual"
        ? "hybrid"
        : "digital";
  const productType: ProductType = row.delivery_type === "shipping" ? "physical" : "digital";

  return {
    id: row.id,
    name: row.name,
    category: productCategory,
    categoryLabel,
    description: row.short_description ?? row.description ?? "",
    imageUrl: row.image_url,
    originalPrice: row.original_price,
    stock: row.stock,
    sortOrder: row.sort_order,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    price: row.price,
    currency: "CNY",
    stockStatus,
    stockLabel: row.status === "sold_out" ? "已售罄" : row.stock <= 0 ? "暂时缺货" : `库存 ${row.stock}`,
    processingTime: getDeliveryLabel(row.delivery_type),
    deliveryMethod,
    deliveryLabel: getDeliveryLabel(row.delivery_type),
    productType,
    listingStatus: row.status === "active" ? "active" : "inactive",
    detail: row.description ?? row.short_description ?? "",
  };
}

export function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}
