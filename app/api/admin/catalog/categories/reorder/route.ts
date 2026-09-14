import { revalidateCategoryCache } from "@/lib/cache/cache-tags";
import { checkRateLimit, checkRequestSize, getAdminRateLimitKey } from "@/lib/security/rate-limit";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { auditCatalogAction, CATEGORY_FIELDS, jsonResponse, requireCatalogAdmin } from "../../_shared";

const SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const MAX_SIBLINGS = 100;
type ReorderItem = { id: string; sortOrder: number };

function parseItems(value: unknown): ReorderItem[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SIBLINGS) return null;
  const items = value.map((item, index) => {
    const row = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
    const requestedSortOrder = Number(row.sortOrder);
    return { id: typeof row.id === "string" ? row.id.trim() : "", sortOrder: (index + 1) * 10, requestedSortOrder };
  });
  if (items.some((item) => !SAFE_ID.test(item.id) || !Number.isSafeInteger(item.requestedSortOrder))) return null;
  if (new Set(items.map((item) => item.id)).size !== items.length) return null;
  return items.map(({ id, sortOrder }) => ({ id, sortOrder }));
}

function scopeQuery(query: any, parentId: string | null) {
  return parentId ? query.eq("parent_id", parentId).eq("level", 2) : query.is("parent_id", null).eq("level", 1);
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const admin = await requireCatalogAdmin(requestId);
  if (!admin.ok) return admin.response;
  const rateLimit = checkRateLimit("admin_write", getAdminRateLimitKey(admin.user.id, "category_reorder"));
  if (!rateLimit.allowed) return rateLimit.response!;
  const sizeError = checkRequestSize(request, 24 * 1024);
  if (sizeError) return sizeError;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const parentId = body.parentId === null ? null : typeof body.parentId === "string" ? body.parentId.trim() : undefined;
  const items = parseItems(body.items);
  if (parentId === undefined || (parentId !== null && !SAFE_ID.test(parentId)) || !items) {
    return jsonResponse({ success: false, error: { code: "INVALID_REORDER", message: "分类排序请求不正确", request_id: requestId } }, 400);
  }

  const service = getSupabaseServiceRoleClient() ?? admin.supabase;
  const { data: currentRows, error: readError } = await scopeQuery(
    service.from("categories").select(CATEGORY_FIELDS).limit(MAX_SIBLINGS + 1),
    parentId
  );
  if (readError) return jsonResponse({ success: false, error: { code: "REORDER_READ_FAILED", message: "分类排序读取失败", request_id: requestId } }, 500);

  const current = currentRows ?? [];
  const requestedIds = new Set(items.map((item) => item.id));
  if (current.length !== items.length || current.length > MAX_SIBLINGS || current.some((row: any) => !requestedIds.has(String(row.id)))) {
    return jsonResponse({ success: false, error: { code: "CATEGORY_SCOPE_MISMATCH", message: "排序必须包含当前层级的全部分类", request_id: requestId } }, 400);
  }

  const previous = new Map(current.map((row: any) => [String(row.id), Number(row.sort_order ?? 0)]));
  const updatedIds: string[] = [];
  try {
    for (const item of items) {
      let update = service.from("categories").update({ sort_order: item.sortOrder }).eq("id", item.id);
      update = parentId ? update.eq("parent_id", parentId).eq("level", 2) : update.is("parent_id", null).eq("level", 1);
      const { data, error } = await update.select("id").maybeSingle();
      if (error || !data) throw error ?? new Error("category moved outside reorder scope");
      updatedIds.push(item.id);
    }
  } catch {
    await Promise.all(updatedIds.map((id) => service.from("categories").update({ sort_order: previous.get(id) ?? 0 }).eq("id", id)));
    await auditCatalogAction({ request, user: admin.user, action: "reorder_categories", module: "categories", targetType: "category_parent", targetId: parentId ?? "root", result: "failed", errorMessage: "分类排序写入失败" });
    return jsonResponse({ success: false, error: { code: "REORDER_WRITE_FAILED", message: "分类排序保存失败，原顺序已恢复", request_id: requestId } }, 500);
  }

  const { data: finalRows, error: finalError } = await scopeQuery(
    service.from("categories").select(CATEGORY_FIELDS).order("sort_order", { ascending: true }).order("name", { ascending: true }).limit(MAX_SIBLINGS),
    parentId
  );
  const expected = new Map(items.map((item) => [item.id, item.sortOrder]));
  if (finalError || !finalRows || finalRows.length !== items.length || finalRows.some((row: any) => expected.get(String(row.id)) !== Number(row.sort_order))) {
    await Promise.all(items.map((item) => service.from("categories").update({ sort_order: previous.get(item.id) ?? 0 }).eq("id", item.id)));
    await auditCatalogAction({ request, user: admin.user, action: "reorder_categories", module: "categories", targetType: "category_parent", targetId: parentId ?? "root", result: "failed", errorMessage: "分类排序写入后的校验失败" });
    return jsonResponse({ success: false, error: { code: "REORDER_VERIFY_FAILED", message: "分类排序保存验证失败，请刷新确认", request_id: requestId } }, 500);
  }

  items.forEach((item) => revalidateCategoryCache({ id: item.id, parentId }));
  await auditCatalogAction({ request, user: admin.user, action: "reorder_categories", module: "categories", targetType: "category_parent", targetId: parentId ?? "root", result: "success", beforeSummary: current.map((row: any) => ({ id: row.id, sort_order: row.sort_order })), afterSummary: items });
  return jsonResponse({ success: true, categories: finalRows, request_id: requestId });
}
