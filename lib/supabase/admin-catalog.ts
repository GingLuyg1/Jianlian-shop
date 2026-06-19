import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type CategoryStatus = "active" | "inactive";
export type ProductStatus = "draft" | "active" | "inactive" | "sold_out";
export type DeliveryType = "manual" | "automatic" | "shipping";

export type AdminCategory = {
  id: string;
  parent_id: string | null;
  level: 1 | 2 | 3;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  sort_order: number;
  status?: CategoryStatus | null;
  is_active?: boolean | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type AdminProduct = {
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
  delivery_type: DeliveryType;
  status: ProductStatus;
  sort_order: number;
  updated_at: string | null;
  created_at?: string | null;
};

export type ProductFilters = {
  search?: string;
  categoryId?: string;
  status?: ProductStatus | "all";
  page?: number;
  pageSize?: number;
};

export type ProductListResult = {
  products: AdminProduct[];
  count: number;
};

export type ProductPayload = {
  name: string;
  slug: string;
  category_id: string | null;
  short_description: string | null;
  description: string | null;
  image_url: string | null;
  price: number;
  original_price: number | null;
  stock: number;
  delivery_type: DeliveryType;
  status: ProductStatus;
  sort_order: number;
};

export type CategoryPayload = {
  parent_id: string | null;
  level: 1 | 2 | 3;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  sort_order: number;
};

function getClient(client?: SupabaseClient) {
  return client ?? getSupabaseBrowserClient();
}

function getErrorMessage(error: unknown, fallback = "操作失败，请稍后重试") {
  return (error as { message?: string } | null | undefined)?.message ?? fallback;
}

function normalizeNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeProduct(row: Record<string, unknown>): AdminProduct {
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
    delivery_type: (row.delivery_type as DeliveryType) ?? "manual",
    status: (row.status as ProductStatus) ?? "draft",
    sort_order: normalizeNumber(row.sort_order),
    updated_at: row.updated_at ? String(row.updated_at) : null,
    created_at: row.created_at ? String(row.created_at) : null,
  };
}

function normalizeCategory(row: Record<string, unknown>): AdminCategory {
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
    status: (row.status as CategoryStatus | null | undefined) ?? null,
    is_active:
      typeof row.is_active === "boolean" ? Boolean(row.is_active) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
    created_at: row.created_at ? String(row.created_at) : null,
  };
}

export function isCategoryEnabled(category: AdminCategory) {
  if (typeof category.is_active === "boolean") return category.is_active;
  return category.status !== "inactive";
}

export async function listCategories(client?: SupabaseClient) {
  const supabase = getClient(client);
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("level", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(getErrorMessage(error, "分类读取失败，请检查权限或网络"));
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(normalizeCategory);
}

export async function createCategory(payload: CategoryPayload) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("categories")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw new Error(getErrorMessage(error, "分类新增失败，请检查填写内容"));
  }

  return normalizeCategory(data as Record<string, unknown>);
}

export async function updateCategory(id: string, payload: CategoryPayload) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("categories")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(getErrorMessage(error, "分类保存失败，请检查权限"));
  }

  return normalizeCategory(data as Record<string, unknown>);
}

export async function deleteCategory(id: string) {
  const { error } = await getSupabaseBrowserClient()
    .from("categories")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(getErrorMessage(error, "分类删除失败，可能仍有关联商品或子分类"));
  }
}

export async function setCategoryStatus(
  category: AdminCategory,
  enabled: boolean
) {
  const payload =
    typeof category.is_active === "boolean"
      ? { is_active: enabled }
      : { status: enabled ? "active" : "inactive" };

  const { error } = await getSupabaseBrowserClient()
    .from("categories")
    .update(payload)
    .eq("id", category.id);

  if (error) {
    throw new Error(getErrorMessage(error, "分类状态更新失败，请检查字段或权限"));
  }
}

export async function listProducts({
  search = "",
  categoryId = "all",
  status = "all",
  page = 1,
  pageSize = 10,
}: ProductFilters): Promise<ProductListResult> {
  const from = Math.max(page - 1, 0) * pageSize;
  const to = from + pageSize - 1;
  let query = getSupabaseBrowserClient()
    .from("products")
    .select("*", { count: "exact" });

  if (search.trim()) {
    query = query.ilike("name", `%${search.trim()}%`);
  }

  if (categoryId !== "all") {
    query = query.eq("category_id", categoryId);
  }

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error, count } = await query
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(getErrorMessage(error, "商品读取失败，请检查权限或筛选条件"));
  }

  return {
    products: ((data ?? []) as Array<Record<string, unknown>>).map(
      normalizeProduct
    ),
    count: count ?? 0,
  };
}

export async function createProduct(payload: ProductPayload) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("products")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw new Error(getErrorMessage(error, "商品新增失败，请检查填写内容"));
  }

  return normalizeProduct(data as Record<string, unknown>);
}

export async function updateProduct(id: string, payload: ProductPayload) {
  const { data, error } = await getSupabaseBrowserClient()
    .from("products")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(getErrorMessage(error, "商品保存失败，请检查权限"));
  }

  return normalizeProduct(data as Record<string, unknown>);
}

export async function deleteProduct(id: string) {
  const { error } = await getSupabaseBrowserClient()
    .from("products")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(getErrorMessage(error, "商品删除失败，请稍后重试"));
  }
}

export async function setProductStatus(id: string, status: ProductStatus) {
  const { error } = await getSupabaseBrowserClient()
    .from("products")
    .update({ status })
    .eq("id", id);

  if (error) {
    throw new Error(getErrorMessage(error, "商品状态更新失败，请检查权限"));
  }
}
