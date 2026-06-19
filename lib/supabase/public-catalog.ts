import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  DeliveryMethod,
  Product,
  ProductCategory,
  ProductType,
  StockStatus,
} from "@/lib/types";

export const FRONTEND_ACTIVE_PRODUCT_STATUS = "active";

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
    is_active:
      typeof row.is_active === "boolean" ? Boolean(row.is_active) : null,
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
    short_description: row.short_description
      ? String(row.short_description)
      : null,
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
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null,
    created_at: row.created_at ? String(row.created_at) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
  };
}

export function getErrorText(
  error: unknown,
  fallback = "操作失败，请稍后重试"
) {
  return (error as { message?: string } | null | undefined)?.message ?? fallback;
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
    throw new Error(getErrorText(error, "分类读取失败，请检查 RLS 读取策略"));
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(
    normalizeCategory
  );
}

export async function listActiveProductsByCategory(categoryId: string) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("products")
    .select(productSelect)
    .eq("category_id", categoryId)
    .eq("status", FRONTEND_ACTIVE_PRODUCT_STATUS)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(getErrorText(error, "商品读取失败，请检查 RLS 读取策略"));
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(normalizeProduct);
}

export async function getActiveProductByIdOrSlug(identifier: string) {
  const supabase = getSupabaseBrowserClient();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      identifier
    );

  const baseQuery = supabase
    .from("products")
    .select(productSelect)
    .eq("status", FRONTEND_ACTIVE_PRODUCT_STATUS)
    .limit(1);

  const { data, error } = isUuid
    ? await baseQuery.eq("id", identifier).maybeSingle()
    : await baseQuery.eq("slug", identifier).maybeSingle();

  if (error) {
    throw new Error(getErrorText(error, "商品详情读取失败"));
  }

  return data ? normalizeProduct(data as Record<string, unknown>) : null;
}

export function findPrimaryCategory(
  categories: PublicCategory[],
  config: PublicCatalogConfig
) {
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

export function getChildCategories(
  categories: PublicCategory[],
  parentId: string
) {
  return categories
    .filter(
      (category) =>
        category.parent_id === parentId &&
        category.level === 2 &&
        isPublicCategoryEnabled(category)
    )
    .sort(
      (first, second) =>
        first.sort_order - second.sort_order ||
        first.name.localeCompare(second.name)
    );
}

export function mapPublicProductToProduct(
  row: PublicProductRow,
  productCategory: ProductCategory,
  categoryLabel: string
): Product {
  const stockStatus: StockStatus =
    row.stock <= 0 ? "out-of-stock" : row.stock <= 10 ? "low-stock" : "in-stock";
  const deliveryMethod: DeliveryMethod =
    row.delivery_type === "shipping"
      ? "physical"
      : row.delivery_type === "manual"
        ? "hybrid"
        : "digital";
  const productType: ProductType =
    row.delivery_type === "shipping" ? "physical" : "digital";

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
    stockLabel: `库存：${row.stock}`,
    processingTime: row.delivery_type === "automatic" ? "自动发货" : "联系客服确认",
    deliveryMethod,
    deliveryLabel: getDeliveryLabel(row.delivery_type),
    productType,
    listingStatus: "active",
    detail: row.description ?? row.short_description ?? "",
  };
}

export function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function getDeliveryLabel(deliveryType: string) {
  if (deliveryType === "automatic") return "自动发货";
  if (deliveryType === "shipping") return "物流发货";
  return "人工处理";
}
