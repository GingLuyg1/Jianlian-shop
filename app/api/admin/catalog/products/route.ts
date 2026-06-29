import {
  PRODUCT_FIELDS,
  assertProductCategory,
  auditCatalogAction,
  jsonResponse,
  normalizeProductPayload,
  parseBody,
  requireCatalogAdmin,
  verifyPersistedProduct,
} from "../_shared";

export async function POST(request: Request) {
  const admin = await requireCatalogAdmin();
  if (!admin.ok) return admin.response;

  const body = parseBody(await request.json().catch(() => ({})));
  const { payload, errors } = normalizeProductPayload(body);
  if (Object.keys(errors).length > 0) {
    return jsonResponse({ error: "\u5546\u54c1\u4fe1\u606f\u586b\u5199\u4e0d\u5b8c\u6574", errors }, 400);
  }

  const categoryError = await assertProductCategory(admin.supabase, payload.category_id as string);
  if (categoryError) return jsonResponse({ error: categoryError }, 400);

  const { data, error } = await admin.supabase.from("products").insert(payload).select(PRODUCT_FIELDS).single();
  if (error) {
    await auditCatalogAction({
      request,
      user: admin.user,
      action: "create_product",
      module: "products",
      targetType: "product",
      targetLabel: String(payload.name ?? ""),
      result: "failed",
      afterSummary: payload,
      errorMessage: "\u5546\u54c1\u65b0\u589e\u5931\u8d25",
    });
    return jsonResponse(
      { error: "\u5546\u54c1\u65b0\u589e\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u5546\u54c1\u6807\u8bc6\u662f\u5426\u91cd\u590d" },
      400
    );
  }

  const verifyError = verifyPersistedProduct(data, payload);
  if (verifyError) {
    await auditCatalogAction({
      request,
      user: admin.user,
      action: "create_product",
      module: "products",
      targetType: "product",
      targetId: String((data as { id?: unknown }).id ?? ""),
      targetLabel: String((data as { name?: unknown }).name ?? ""),
      result: "failed",
      afterSummary: data,
      errorMessage: verifyError,
    });
    return jsonResponse({ error: verifyError }, 409);
  }

  await auditCatalogAction({
    request,
    user: admin.user,
    action: "create_product",
    module: "products",
    targetType: "product",
    targetId: String((data as { id?: unknown }).id ?? ""),
    targetLabel: String((data as { name?: unknown }).name ?? ""),
    result: "success",
    afterSummary: data,
  });

  return jsonResponse({ product: data }, 201);
}