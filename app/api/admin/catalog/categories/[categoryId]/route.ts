import {
  CATEGORY_FIELDS,
  assertCategoryParent,
  auditCatalogAction,
  jsonResponse,
  normalizeCategoryPayload,
  parseBody,
  requireCatalogAdmin,
} from "../../_shared";

import { markMediaReferenceByUrl } from "@/lib/media/media-service";

type RouteContext = {
  params: { categoryId: string };
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const admin = await requireCatalogAdmin();
  if (!admin.ok) return admin.response;

  const { data: before, error: beforeError } = await admin.supabase
    .from("categories")
    .select(CATEGORY_FIELDS)
    .eq("id", params.categoryId)
    .maybeSingle();
  if (beforeError || !before) return jsonResponse({ error: "鍒嗙被涓嶅瓨鍦ㄦ垨宸茶鍒犻櫎" }, 404);

  const body = parseBody(await request.json().catch(() => ({})));
  const { payload, errors } = normalizeCategoryPayload(body, true);
  if (Object.keys(errors).length > 0) {
    return jsonResponse({ error: "分类信息填写不完整", errors }, 400);
  }
  if (Object.keys(payload).length === 0) {
    return jsonResponse({ error: "娌℃湁闇€瑕佷繚瀛樼殑鍒嗙被鍙樻洿" }, 400);
  }

  const nextLevel = payload.level ?? ((before as { level?: 1 | 2 }).level ?? 1);
  const parentError = await assertCategoryParent(admin.supabase, { ...payload, level: nextLevel }, params.categoryId);
  if (parentError) return jsonResponse({ error: parentError }, 400);

  const { data, error } = await admin.supabase
    .from("categories")
    .update(payload)
    .eq("id", params.categoryId)
    .select(CATEGORY_FIELDS)
    .single();
  if (error) {
    await auditCatalogAction({
      request,
      user: admin.user,
      action: "update_category",
      module: "categories",
      targetType: "category",
      targetId: params.categoryId,
      targetLabel: String((before as { name?: unknown }).name ?? ""),
      result: "failed",
      beforeSummary: before,
      afterSummary: payload,
      errorMessage: "鍒嗙被淇濆瓨澶辫触",
    });
    return jsonResponse({ error: "分类保存失败，请检查分类标识是否重复" }, 400);
  }

  await markMediaReferenceByUrl(admin.supabase, (data as { icon?: string | null }).icon, "category", params.categoryId);

  await auditCatalogAction({
    request,
    user: admin.user,
    action: "update_category",
    module: "categories",
    targetType: "category",
    targetId: params.categoryId,
    targetLabel: String((data as { name?: unknown }).name ?? ""),
    result: "success",
    beforeSummary: before,
    afterSummary: data,
  });

  return jsonResponse({ category: data });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const admin = await requireCatalogAdmin();
  if (!admin.ok) return admin.response;

  const { data: before, error: beforeError } = await admin.supabase
    .from("categories")
    .select(CATEGORY_FIELDS)
    .eq("id", params.categoryId)
    .maybeSingle();
  if (beforeError || !before) return jsonResponse({ error: "鍒嗙被涓嶅瓨鍦ㄦ垨宸茶鍒犻櫎" }, 404);

  const { count: childCount, error: childError } = await admin.supabase
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", params.categoryId);
  if (childError) return jsonResponse({ error: "鍒嗙被鍒犻櫎鏍￠獙澶辫触锛岃绋嶅悗閲嶈瘯" }, 400);
  if ((childCount ?? 0) > 0) {
    return jsonResponse({ error: "该分类下还有子分类，请先移动或删除子分类" }, 400);
  }

  const { count: productCount, error: productError } = await admin.supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("category_id", params.categoryId);
  if (productError) return jsonResponse({ error: "鍒嗙被鍟嗗搧鏍￠獙澶辫触锛岃绋嶅悗閲嶈瘯" }, 400);
  if ((productCount ?? 0) > 0) {
    return jsonResponse({ error: "该分类下还有关联商品，请先移动商品后再删除" }, 400);
  }

  const { error } = await admin.supabase.from("categories").delete().eq("id", params.categoryId);
  if (error) {
    await auditCatalogAction({
      request,
      user: admin.user,
      action: "delete_category",
      module: "categories",
      targetType: "category",
      targetId: params.categoryId,
      targetLabel: String((before as { name?: unknown }).name ?? ""),
      result: "failed",
      beforeSummary: before,
      errorMessage: "鍒嗙被鍒犻櫎澶辫触",
    });
    return jsonResponse({ error: "鍒嗙被鍒犻櫎澶辫触锛岃绋嶅悗閲嶈瘯" }, 400);
  }

  await auditCatalogAction({
    request,
    user: admin.user,
    action: "delete_category",
    module: "categories",
    targetType: "category",
    targetId: params.categoryId,
    targetLabel: String((before as { name?: unknown }).name ?? ""),
    result: "success",
    beforeSummary: before,
  });

  return jsonResponse({ ok: true });
}


