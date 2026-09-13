import { checkRateLimit, checkRequestSize, getAdminRateLimitKey } from "@/lib/security/rate-limit";
import { revalidateProductCache } from "@/lib/cache/cache-tags";
import { auditCatalogAction, jsonResponse, PRODUCT_FIELDS, requireCatalogAdmin } from "../../_shared";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

const SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const MAX_CATEGORY_PRODUCTS = 100;

type ReorderItem = { id: string; sortOrder: number };

function parseItems(value: unknown): ReorderItem[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CATEGORY_PRODUCTS) return null;
  const items = value.map((item) => {
    const record = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
    return { id: typeof record.id === "string" ? record.id.trim() : "", sortOrder: Number(record.sortOrder) };
  });
  if (items.some((item) => !SAFE_ID.test(item.id) || !Number.isSafeInteger(item.sortOrder))) return null;
  if (new Set(items.map((item) => item.id)).size !== items.length) return null;
  return items;
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const admin = await requireCatalogAdmin(requestId);
  if (!admin.ok) return admin.response;
  const rateLimit = checkRateLimit("admin_write", getAdminRateLimitKey(admin.user.id, "product_reorder"));
  if (!rateLimit.allowed) return rateLimit.response!;
  const requestSizeError = checkRequestSize(request, 32 * 1024);
  if (requestSizeError) return requestSizeError;
  const service = getSupabaseServiceRoleClient() ?? admin.supabase;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const categoryId = typeof body.categoryId === "string" ? body.categoryId.trim() : "";
  const items = parseItems(body.items);
  if (!SAFE_ID.test(categoryId) || !items) {
    return jsonResponse({ success: false, error: { code: "INVALID_REORDER", message: "排序请求不正确", request_id: requestId } }, 400);
  }

  const { data: currentRows, error: readError } = await service
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("category_id", categoryId)
    .limit(MAX_CATEGORY_PRODUCTS + 1);
  if (readError) return jsonResponse({ success: false, error: { code: "REORDER_READ_FAILED", message: "商品排序读取失败", request_id: requestId } }, 500);

  const current = currentRows ?? [];
  const requestedIds = new Set(items.map((item) => item.id));
  if (current.length !== items.length || current.length > MAX_CATEGORY_PRODUCTS || current.some((row) => !requestedIds.has(String(row.id)))) {
    return jsonResponse({ success: false, error: { code: "CATEGORY_PRODUCT_MISMATCH", message: "排序必须包含当前分类的全部商品", request_id: requestId } }, 400);
  }

  const previous = new Map(current.map((row) => [String(row.id), Number(row.sort_order ?? 0)]));
  const updatedIds: string[] = [];
  try {
    for (const item of items) {
      const { data, error } = await service
        .from("products")
        .update({ sort_order: item.sortOrder })
        .eq("id", item.id)
        .eq("category_id", categoryId)
        .select("id")
        .maybeSingle();
      if (error || !data) throw error ?? new Error("product no longer belongs to category");
      updatedIds.push(item.id);
    }
  } catch {
    await Promise.all(updatedIds.map((id) => service.from("products").update({ sort_order: previous.get(id) ?? 0 }).eq("id", id).eq("category_id", categoryId)));
    await auditCatalogAction({ request, user: admin.user, action: "reorder_products", module: "products", targetType: "category", targetId: categoryId, result: "failed", errorMessage: "商品排序写入失败" });
    return jsonResponse({ success: false, error: { code: "REORDER_WRITE_FAILED", message: "商品排序保存失败，原顺序已恢复", request_id: requestId } }, 500);
  }

  const { data: finalRows, error: finalError } = await service
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("category_id", categoryId)
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(MAX_CATEGORY_PRODUCTS);
  const expectedOrders = new Map(items.map((item) => [item.id, item.sortOrder]));
  if (finalError || !finalRows || finalRows.length !== items.length || finalRows.some((row) => expectedOrders.get(String(row.id)) !== Number(row.sort_order))) {
    return jsonResponse({ success: false, error: { code: "REORDER_VERIFY_FAILED", message: "商品排序保存验证失败，请刷新确认", request_id: requestId } }, 500);
  }

  items.forEach((item) => revalidateProductCache({ id: item.id, categoryId }));
  await auditCatalogAction({ request, user: admin.user, action: "reorder_products", module: "products", targetType: "category", targetId: categoryId, result: "success", beforeSummary: current.map((row) => ({ id: row.id, sort_order: row.sort_order })), afterSummary: items });
  return jsonResponse({ success: true, products: finalRows, request_id: requestId });
}
