import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import type { CategoryPayload, DeliveryType, ProductPayload, ProductStatus } from "@/lib/supabase/admin-catalog";

export const PRODUCT_FIELDS =
  "id,category_id,name,slug,short_description,description,image_url,price,original_price,stock,delivery_type,status,sort_order,metadata,updated_at,created_at";
export const CATEGORY_FIELDS =
  "id,parent_id,level,name,slug,icon,description,sort_order,status,is_active,updated_at,created_at";

const PRODUCT_STATUSES: ProductStatus[] = ["draft", "active", "inactive", "sold_out"];
const DELIVERY_TYPES: DeliveryType[] = ["manual", "automatic", "shipping"];

export function jsonResponse(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function requireCatalogAdmin() {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    return { ok: false as const, response: jsonResponse({ error: admin.message }, admin.status) };
  }
  return { ok: true as const, supabase: admin.supabase, user: admin.user };
}

export function parseBody(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNullableText(value: unknown) {
  const text = cleanText(value);
  return text || null;
}

function finiteNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function finiteInteger(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : fallback;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function normalizeProductPayload(body: Record<string, unknown>, partial = false) {
  const payload: Partial<ProductPayload> = {};
  const errors: Record<string, string> = {};

  if (!partial || "name" in body) {
    const name = cleanText(body.name);
    if (!name) errors.name = "商品名称不能为空";
    payload.name = name;
  }
  if (!partial || "slug" in body) {
    const slug = cleanText(body.slug).toLowerCase();
    if (!slug) errors.slug = "商品标识不能为空";
    else if (!/^[a-z0-9-]+$/.test(slug)) errors.slug = "商品标识只能包含小写字母、数字和短横线";
    payload.slug = slug;
  }
  if (!partial || "category_id" in body) {
    payload.category_id = cleanNullableText(body.category_id);
    if (!payload.category_id) errors.category_id = "请选择商品分类";
  }
  if (!partial || "short_description" in body) payload.short_description = cleanNullableText(body.short_description);
  if (!partial || "description" in body) payload.description = cleanNullableText(body.description);
  if (!partial || "image_url" in body) payload.image_url = cleanNullableText(body.image_url);
  if (!partial || "price" in body) {
    const price = finiteNumber(body.price, -1);
    if (price < 0) errors.price = "售价必须大于或等于 0";
    payload.price = price;
  }
  if (!partial || "original_price" in body) {
    const originalPrice =
      body.original_price === null || body.original_price === "" ? null : finiteNumber(body.original_price, -1);
    if (originalPrice !== null && originalPrice < 0) errors.original_price = "原价必须大于或等于 0";
    payload.original_price = originalPrice;
  }
  if (!partial || "stock" in body) {
    const stock = finiteInteger(body.stock, -1);
    if (stock < 0) errors.stock = "库存必须大于或等于 0";
    payload.stock = stock;
  }
  if (!partial || "delivery_type" in body) {
    const deliveryType = cleanText(body.delivery_type) as DeliveryType;
    if (!DELIVERY_TYPES.includes(deliveryType)) errors.delivery_type = "请选择有效交付方式";
    payload.delivery_type = deliveryType;
  }
  if (!partial || "status" in body) {
    const status = cleanText(body.status) as ProductStatus;
    if (!PRODUCT_STATUSES.includes(status)) errors.status = "请选择有效商品状态";
    payload.status = status;
  }
  if (!partial || "sort_order" in body) payload.sort_order = finiteInteger(body.sort_order, 0);
  if (!partial || "metadata" in body) payload.metadata = isPlainObject(body.metadata) ? body.metadata : null;

  if (
    payload.original_price !== undefined &&
    payload.original_price !== null &&
    payload.price !== undefined &&
    payload.original_price < payload.price
  ) {
    errors.original_price = "原价不能小于售价";
  }

  return { payload, errors };
}

export function normalizeCategoryPayload(body: Record<string, unknown>, partial = false) {
  const payload: Partial<CategoryPayload> = {};
  const errors: Record<string, string> = {};

  if (!partial || "name" in body) {
    const name = cleanText(body.name);
    if (!name) errors.name = "分类名称不能为空";
    payload.name = name;
  }
  if (!partial || "slug" in body) {
    const slug = cleanText(body.slug).toLowerCase();
    if (!slug) errors.slug = "分类标识不能为空";
    else if (!/^[a-z0-9-]+$/.test(slug)) errors.slug = "分类标识只能包含小写字母、数字和短横线";
    payload.slug = slug;
  }
  if (!partial || "level" in body) {
    const level = finiteInteger(body.level, 0);
    if (level !== 1 && level !== 2) errors.level = "分类层级只能是一级或二级";
    payload.level = level as 1 | 2;
  }
  if (!partial || "parent_id" in body) payload.parent_id = cleanNullableText(body.parent_id);
  if (!partial || "icon" in body) payload.icon = cleanNullableText(body.icon);
  if (!partial || "description" in body) payload.description = cleanNullableText(body.description);
  if (!partial || "sort_order" in body) payload.sort_order = finiteInteger(body.sort_order, 0);
  if (!partial || "is_active" in body) payload.is_active = Boolean(body.is_active);

  if (payload.level === 1) payload.parent_id = null;
  if (payload.level === 2 && !payload.parent_id) errors.parent_id = "二级分类必须选择所属一级分类";
  return { payload, errors };
}

export async function assertProductCategory(supabase: SupabaseClient, categoryId: string) {
  const { data: category, error } = await supabase
    .from("categories")
    .select("id,level,is_active,status")
    .eq("id", categoryId)
    .maybeSingle();

  if (error || !category) return "请选择有效商品分类";
  const enabled =
    typeof (category as { is_active?: unknown }).is_active === "boolean"
      ? Boolean((category as { is_active?: unknown }).is_active)
      : (category as { status?: string | null }).status !== "inactive";
  if (!enabled) return "不能绑定已停用分类";

  const { count, error: childError } = await supabase
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", categoryId);
  if (childError) return "分类校验失败，请稍后重试";
  if ((count ?? 0) > 0) return "商品只能绑定末级分类";
  return null;
}

export async function assertCategoryParent(
  supabase: SupabaseClient,
  payload: Partial<CategoryPayload>,
  categoryId?: string
) {
  if (payload.level === 1) return null;
  if (!payload.parent_id) return "二级分类必须选择所属一级分类";
  if (categoryId && payload.parent_id === categoryId) return "分类不能选择自身作为父级";
  const { data: parent, error } = await supabase
    .from("categories")
    .select("id,level")
    .eq("id", payload.parent_id)
    .maybeSingle();
  if (error || !parent) return "所属一级分类不存在";
  if ((parent as { level?: number }).level !== 1) return "二级分类只能归属一级分类";
  return null;
}

function normalizePersistedComparable(value: unknown): unknown {
  if (value === undefined || value === "") return null;
  if (typeof value === "string") {
    const text = value.trim();
    return text || null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.map((item) => normalizePersistedComparable(item));
  if (isPlainObject(value)) {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((next, key) => {
        next[key] = normalizePersistedComparable(value[key]);
        return next;
      }, {});
  }
  return value;
}

function comparableValuesMatch(left: unknown, right: unknown) {
  const normalizedLeft = normalizePersistedComparable(left);
  const normalizedRight = normalizePersistedComparable(right);
  if (typeof normalizedLeft === "number" || typeof normalizedRight === "number") {
    const leftNumber = Number(normalizedLeft);
    const rightNumber = Number(normalizedRight);
    return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && Math.abs(leftNumber - rightNumber) < 0.000001;
  }
  return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
}

export function verifyPersistedProduct(row: unknown, payload: Partial<ProductPayload>) {
  if (!isPlainObject(row)) return "\u5546\u54c1\u4fdd\u5b58\u5931\u8d25\uff0c\u6570\u636e\u5e93\u6ca1\u6709\u8fd4\u56de\u6700\u65b0\u5546\u54c1";

  const mismatchedFields = Object.keys(payload).filter((key) => {
    const field = key as keyof ProductPayload;
    return !comparableValuesMatch(payload[field], row[field]);
  });

  if (mismatchedFields.length > 0) return "\u5546\u54c1\u4fdd\u5b58\u9a8c\u8bc1\u5931\u8d25\uff0c\u8bf7\u5237\u65b0\u540e\u91cd\u8bd5";
  return null;
}

export async function auditCatalogAction(input: {
  request: Request;
  user: User;
  action: string;
  module: "products" | "categories";
  targetType: string;
  targetId?: string | null;
  targetLabel?: string | null;
  result: "success" | "failed";
  beforeSummary?: unknown;
  afterSummary?: unknown;
  errorMessage?: unknown;
}) {
  await writeAdminAuditLog({
    request: input.request,
    admin: { id: input.user.id, email: input.user.email ?? null },
    action: input.action,
    module: input.module,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    targetLabel: input.targetLabel ?? null,
    result: input.result,
    beforeSummary: input.beforeSummary,
    afterSummary: input.afterSummary,
    errorMessage: input.errorMessage,
  });
}
