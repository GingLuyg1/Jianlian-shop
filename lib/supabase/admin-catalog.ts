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
  subcategory_id?: string | null;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  image_url: string | null;
  gallery?: string[] | null;
  price: number;
  original_price: number | null;
  stock: number;
  delivery_type: DeliveryType;
  status: ProductStatus;
  sort_order: number;
  has_skus?: boolean;
  metadata?: Record<string, unknown> | null;
  updated_at: string | null;
  created_at?: string | null;
};

export type ProductFilters = {
  search?: string;
  categoryId?: string;
  categoryIds?: string[];
  status?: ProductStatus | "all";
  deliveryType?: DeliveryType | "all";
  sortBy?: "sort_order" | "updated_at";
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
  subcategory_id?: string | null;
  short_description: string | null;
  description: string | null;
  image_url: string | null;
  gallery?: string[] | null;
  price: number;
  original_price: number | null;
  stock: number;
  delivery_type: DeliveryType;
  status: ProductStatus;
  sort_order: number;
  has_skus?: boolean;
  metadata?: Record<string, unknown> | null;
};

export type CategoryPayload = {
  parent_id: string | null;
  level: 1 | 2 | 3;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  sort_order: number;
  is_active?: boolean;
};

function getClient(client?: SupabaseClient) {
  return client ?? getSupabaseBrowserClient();
}

function getErrorMessage(error: unknown, fallback = "操作失败，请稍后重试") {
  const message = (error as { message?: string } | null | undefined)?.message;
  if (!message) return fallback;
  if (/relation|column|schema|sql|supabase|jwt|apikey|url|permission denied/i.test(message)) {
    return fallback;
  }
  return message;
}

async function adminCatalogRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    errors?: Record<string, string>;
  } & T;

  if (!response.ok) {
    const fieldError = body.errors ? Object.values(body.errors)[0] : "";
    throw new Error(body.error || fieldError || "操作失败，请稍后重试");
  }

  return body as T;
}

type AdminCatalogEnvelope<T> = T & {
  success?: boolean;
  data?: Partial<T>;
  error?: string | { code?: string; message?: string; request_id?: string };
  errors?: Record<string, string>;
  request_id?: string;
};

function getEnvelopeErrorMessage(body: AdminCatalogEnvelope<unknown>, fallback = "商品保存失败，请检查输入后重试") {
  if (typeof body.error === "string" && body.error.trim()) return body.error;
  const message = typeof body.error === "object" ? body.error?.message : "";
  const requestId =
    typeof body.error === "object" ? body.error?.request_id || body.request_id : body.request_id;
  const fieldError = body.errors ? Object.values(body.errors).find(Boolean) : "";
  const text = message || fieldError || fallback;
  return requestId ? `${text}（错误编号：${requestId}）` : text;
}

async function adminCatalogEnvelopeRequest<T>(url: string, init: RequestInit = {}): Promise<AdminCatalogEnvelope<T>> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as AdminCatalogEnvelope<T>;
  const requestId = response.headers.get("X-Request-ID");
  if (requestId && !body.request_id) body.request_id = requestId;

  if (!response.ok || body.success === false) {
    throw new Error(getEnvelopeErrorMessage(body));
  }

  return body;
}

function normalizeNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeProduct(row: Record<string, unknown>): AdminProduct {
  const gallery = Array.isArray(row.gallery)
    ? row.gallery.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : null;

  return {
    id: String(row.id),
    category_id: row.category_id ? String(row.category_id) : null,
    subcategory_id: row.subcategory_id ? String(row.subcategory_id) : null,
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    short_description: row.short_description ? String(row.short_description) : null,
    description: row.description ? String(row.description) : null,
    image_url: row.image_url ? String(row.image_url) : null,
    gallery,
    price: normalizeNumber(row.price),
    original_price:
      row.original_price === null || row.original_price === undefined
        ? null
        : normalizeNumber(row.original_price),
    stock: normalizeNumber(row.stock),
    delivery_type: (row.delivery_type as DeliveryType) ?? "manual",
    status: (row.status as ProductStatus) ?? "draft",
    sort_order: normalizeNumber(row.sort_order),
    has_skus: Boolean(row.has_skus),
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
    created_at: row.created_at ? String(row.created_at) : null,
  };
}

function assertApiRecord(value: unknown, fallback: string) {
  if (!value || typeof value !== "object" || !("id" in value)) throw new Error(fallback);
  return value as Record<string, unknown>;
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
    is_active: typeof row.is_active === "boolean" ? Boolean(row.is_active) : null,
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
  const result = await adminCatalogRequest<{ category: Record<string, unknown> }>("/api/admin/catalog/categories", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return normalizeCategory(result.category);
}

export async function updateCategory(id: string, payload: CategoryPayload) {
  const result = await adminCatalogRequest<{ category: Record<string, unknown> }>(
    `/api/admin/catalog/categories/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );
  return normalizeCategory(result.category);
}

export async function deleteCategory(id: string) {
  await adminCatalogRequest<{ ok: boolean }>(`/api/admin/catalog/categories/${id}`, {
    method: "DELETE",
  });
}

export async function setCategoryStatus(category: AdminCategory, enabled: boolean) {
  const payload =
    typeof category.is_active === "boolean"
      ? { is_active: enabled }
      : { status: enabled ? "active" : "inactive" };

  await adminCatalogRequest<{ category: Record<string, unknown> }>(
    `/api/admin/catalog/categories/${category.id}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );
}

export async function listProducts({
  search = "",
  categoryId = "all",
  categoryIds,
  status = "all",
  deliveryType = "all",
  sortBy = "sort_order",
  page = 1,
  pageSize = 10,
}: ProductFilters): Promise<ProductListResult> {
  const from = Math.max(page - 1, 0) * pageSize;
  const to = from + pageSize - 1;
  let query = getSupabaseBrowserClient().from("products").select("*", { count: "exact" });

  const searchTerm = search.trim();
  if (searchTerm) {
    query = query.or(`name.ilike.%${searchTerm}%,slug.ilike.%${searchTerm}%`);
  }

  if (categoryId !== "all") {
    query = query.eq("category_id", categoryId);
  } else if (categoryIds && categoryIds.length > 0) {
    query = query.in("category_id", categoryIds);
  }

  if (status !== "all") query = query.eq("status", status);
  if (deliveryType !== "all") query = query.eq("delivery_type", deliveryType);

  const sortedQuery =
    sortBy === "updated_at"
      ? query.order("updated_at", { ascending: false }).order("sort_order", { ascending: true })
      : query.order("sort_order", { ascending: true }).order("updated_at", { ascending: false });

  const { data, error, count } = await sortedQuery.range(from, to);

  if (error) {
    throw new Error(getErrorMessage(error, "商品读取失败，请检查权限或筛选条件"));
  }

  return {
    products: ((data ?? []) as Array<Record<string, unknown>>).map(normalizeProduct),
    count: count ?? 0,
  };
}

export async function createProduct(payload: ProductPayload) {
  const result = await adminCatalogEnvelopeRequest<{ product: Record<string, unknown> }>("/api/admin/catalog/products", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const product = result.product ?? result.data?.product;
  return normalizeProduct(assertApiRecord(product, "\u5546\u54c1\u4fdd\u5b58\u5931\u8d25\uff0c\u670d\u52a1\u5668\u6ca1\u6709\u8fd4\u56de\u6700\u65b0\u5546\u54c1"));
}

export async function updateProduct(id: string, payload: ProductPayload) {
  const productId = id.trim();
  if (!productId) {
    throw new Error("\u5546\u54c1\u4fdd\u5b58\u5931\u8d25\uff0c\u5546\u54c1 ID \u4e0d\u80fd\u4e3a\u7a7a");
  }
  const result = await adminCatalogEnvelopeRequest<{ product: Record<string, unknown> }>(
    `/api/admin/catalog/products/${encodeURIComponent(productId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );
  const product = result.product ?? result.data?.product;
  return normalizeProduct(assertApiRecord(product, "\u5546\u54c1\u4fdd\u5b58\u5931\u8d25\uff0c\u670d\u52a1\u5668\u6ca1\u6709\u8fd4\u56de\u6700\u65b0\u5546\u54c1"));
}

export async function deleteProduct(id: string) {
  await adminCatalogRequest<{ ok: boolean }>(`/api/admin/catalog/products/${id}`, {
    method: "DELETE",
  });
}

export async function setProductStatus(id: string, status: ProductStatus) {
  await adminCatalogRequest<{ product: Record<string, unknown> }>(`/api/admin/catalog/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
