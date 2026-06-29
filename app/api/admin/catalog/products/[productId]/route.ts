import {
  PRODUCT_FIELDS,
  assertProductCategory,
  auditCatalogAction,
  jsonResponse,
  normalizeProductPayload,
  parseBody,
  requireCatalogAdmin,
  verifyPersistedProduct,
} from "../../_shared";

type RouteContext = {
  params: { productId: string };
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const admin = await requireCatalogAdmin();
  if (!admin.ok) return admin.response;

  const { data: before, error: beforeError } = await admin.supabase
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("id", params.productId)
    .maybeSingle();
  if (beforeError || !before) return jsonResponse({ error: "商品不存在或已被删除" }, 404);

  const body = parseBody(await request.json().catch(() => ({})));
  const { payload, errors } = normalizeProductPayload(body, true);
  if (Object.keys(errors).length > 0) {
    return jsonResponse({ error: "商品信息填写不完整", errors }, 400);
  }
  if (Object.keys(payload).length === 0) {
    return jsonResponse({ error: "没有需要保存的商品变更" }, 400);
  }

  if (payload.category_id) {
    const categoryError = await assertProductCategory(admin.supabase, payload.category_id);
    if (categoryError) return jsonResponse({ error: categoryError }, 400);
  }

  const { data, error } = await admin.supabase
    .from("products")
    .update(payload)
    .eq("id", params.productId)
    .select(PRODUCT_FIELDS)
    .maybeSingle();
  if (error || !data) {
    await auditCatalogAction({
      request,
      user: admin.user,
      action: "update_product",
      module: "products",
      targetType: "product",
      targetId: params.productId,
      targetLabel: String((before as { name?: unknown }).name ?? ""),
      result: "failed",
      beforeSummary: before,
      afterSummary: payload,
      errorMessage: "\u5546\u54c1\u4fdd\u5b58\u5931\u8d25",
    });
    return jsonResponse(
      { error: data ? "\u5546\u54c1\u4fdd\u5b58\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u5546\u54c1\u6807\u8bc6\u662f\u5426\u91cd\u590d" : "\u5546\u54c1\u4fdd\u5b58\u5931\u8d25\uff0c\u672a\u627e\u5230\u5bf9\u5e94\u5546\u54c1\u6216\u6ca1\u6709\u66f4\u65b0\u4efb\u4f55\u8bb0\u5f55" },
      400
    );
  }

  const verifyError = verifyPersistedProduct(data, payload);
  if (verifyError) {
    await auditCatalogAction({
      request,
      user: admin.user,
      action: "update_product",
      module: "products",
      targetType: "product",
      targetId: params.productId,
      targetLabel: String((before as { name?: unknown }).name ?? ""),
      result: "failed",
      beforeSummary: before,
      afterSummary: data,
      errorMessage: verifyError,
    });
    return jsonResponse({ error: verifyError }, 409);
  }

  await auditCatalogAction({
    request,
    user: admin.user,
    action: "update_product",
    module: "products",
    targetType: "product",
    targetId: params.productId,
    targetLabel: String((data as { name?: unknown }).name ?? ""),
    result: "success",
    beforeSummary: before,
    afterSummary: data,
  });

  return jsonResponse({ product: data });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const admin = await requireCatalogAdmin();
  if (!admin.ok) return admin.response;

  const { data: before, error: beforeError } = await admin.supabase
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("id", params.productId)
    .maybeSingle();
  if (beforeError || !before) return jsonResponse({ error: "商品不存在或已被删除" }, 404);

  const { error } = await admin.supabase.from("products").delete().eq("id", params.productId);
  if (error) {
    await auditCatalogAction({
      request,
      user: admin.user,
      action: "delete_product",
      module: "products",
      targetType: "product",
      targetId: params.productId,
      targetLabel: String((before as { name?: unknown }).name ?? ""),
      result: "failed",
      beforeSummary: before,
      errorMessage: "商品删除失败",
    });
    return jsonResponse({ error: "商品删除失败，请稍后重试" }, 400);
  }

  await auditCatalogAction({
    request,
    user: admin.user,
    action: "delete_product",
    module: "products",
    targetType: "product",
    targetId: params.productId,
    targetLabel: String((before as { name?: unknown }).name ?? ""),
    result: "success",
    beforeSummary: before,
  });

  return jsonResponse({ ok: true });
}
