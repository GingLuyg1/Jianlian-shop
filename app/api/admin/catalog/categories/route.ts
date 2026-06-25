import {
  CATEGORY_FIELDS,
  assertCategoryParent,
  auditCatalogAction,
  jsonResponse,
  normalizeCategoryPayload,
  parseBody,
  requireCatalogAdmin,
} from "../_shared";

export async function POST(request: Request) {
  const admin = await requireCatalogAdmin();
  if (!admin.ok) return admin.response;

  const body = parseBody(await request.json().catch(() => ({})));
  const { payload, errors } = normalizeCategoryPayload(body);
  if (Object.keys(errors).length > 0) {
    return jsonResponse({ error: "分类信息填写不完整", errors }, 400);
  }

  const parentError = await assertCategoryParent(admin.supabase, payload);
  if (parentError) return jsonResponse({ error: parentError }, 400);

  const { data, error } = await admin.supabase.from("categories").insert(payload).select(CATEGORY_FIELDS).single();
  if (error) {
    await auditCatalogAction({
      request,
      user: admin.user,
      action: "create_category",
      module: "categories",
      targetType: "category",
      targetLabel: String(payload.name ?? ""),
      result: "failed",
      afterSummary: payload,
      errorMessage: "分类新增失败",
    });
    return jsonResponse({ error: "分类新增失败，请检查分类标识是否重复" }, 400);
  }

  await auditCatalogAction({
    request,
    user: admin.user,
    action: "create_category",
    module: "categories",
    targetType: "category",
    targetId: String((data as { id?: unknown }).id ?? ""),
    targetLabel: String((data as { name?: unknown }).name ?? ""),
    result: "success",
    afterSummary: data,
  });

  return jsonResponse({ category: data }, 201);
}
