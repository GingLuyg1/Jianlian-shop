import {
  PRODUCT_FIELDS,
  assertProductCategory,
  auditCatalogAction,
  jsonResponse,
  normalizeProductUpdatePayload,
  parseBody,
  requireCatalogAdmin,
  verifyPersistedProduct,
} from "../../_shared";

import { markMediaReferenceByUrl } from "@/lib/media/media-service";
import { revalidateProductCache } from "@/lib/cache/cache-tags";
import { checkRateLimit, checkRequestSize, getAdminRateLimitKey } from "@/lib/security/rate-limit";

type RouteContext = {
  params: { productId: string };
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

function getProductSaveError(error: unknown, fallback = "商品保存失败，请稍后重试") {
  const message = (error as { message?: string; code?: string } | null | undefined)?.message ?? "";
  const code = (error as { code?: string } | null | undefined)?.code ?? "";

  if (code === "PGRST116" || /0 rows|multiple rows|no rows|JSON object requested/i.test(message)) {
    return "商品保存失败，没有更新任何记录";
  }
  if (code === "23505" || /duplicate|unique/i.test(message)) {
    return "商品保存失败，请检查商品标识是否重复";
  }
  if (code === "23503" || /foreign key/i.test(message)) {
    return "商品保存失败，分类无效";
  }
  return fallback;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const admin = await requireCatalogAdmin();
  if (!admin.ok) return admin.response;

  const productId = params.productId?.trim();
  if (!productId || !UUID_PATTERN.test(productId)) {
    return jsonResponse({ error: "商品 ID 无效" }, 400);
  }

  const sizeError = checkRequestSize(request, 64 * 1024);
  if (sizeError) return sizeError;

  const rateLimit = checkRateLimit("admin_write", getAdminRateLimitKey(admin.user.id, `product_update:${productId}`));
  if (!rateLimit.allowed) return rateLimit.response!;

  const { data: before, error: beforeError } = await admin.supabase
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("id", productId)
    .maybeSingle();
  if (beforeError || !before) return jsonResponse({ error: "商品不存在或已被删除" }, 404);

  const body = parseBody(await request.json().catch(() => ({})));
  const { payload, errors } = normalizeProductUpdatePayload(body);
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
    .eq("id", productId)
    .select(PRODUCT_FIELDS)
    .single();

  if (error || !data) {
    const errorMessage = getProductSaveError(error, "商品保存失败，没有更新任何记录");
    await auditCatalogAction({
      request,
      user: admin.user,
      action: "update_product",
      module: "products",
      targetType: "product",
      targetId: productId,
      targetLabel: String((before as { name?: unknown }).name ?? ""),
      result: "failed",
      beforeSummary: before,
      afterSummary: payload,
      errorMessage,
    });
    return jsonResponse({ error: errorMessage }, 400);
  }

  const verifyError = verifyPersistedProduct(data, payload);
  if (verifyError) {
    await auditCatalogAction({
      request,
      user: admin.user,
      action: "update_product",
      module: "products",
      targetType: "product",
      targetId: productId,
      targetLabel: String((before as { name?: unknown }).name ?? ""),
      result: "failed",
      beforeSummary: before,
      afterSummary: data,
      errorMessage: verifyError,
    });
    return jsonResponse({ error: verifyError }, 409);
  }

  await markMediaReferenceByUrl(admin.supabase, (data as { image_url?: string | null }).image_url, "product", productId);
  revalidateProductCache({
    id: productId,
    slug: String((data as { slug?: unknown }).slug ?? ""),
    previousSlug: String((before as { slug?: unknown }).slug ?? ""),
    categoryId: String((data as { category_id?: unknown }).category_id ?? ""),
    previousCategoryId: String((before as { category_id?: unknown }).category_id ?? ""),
  });

  await auditCatalogAction({
    request,
    user: admin.user,
    action: "update_product",
    module: "products",
    targetType: "product",
    targetId: productId,
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

  const productId = params.productId?.trim();
  if (!productId || !UUID_PATTERN.test(productId)) {
    return jsonResponse({ error: "商品 ID 无效" }, 400);
  }

  const rateLimit = checkRateLimit("admin_write", getAdminRateLimitKey(admin.user.id, `product_delete:${productId}`));
  if (!rateLimit.allowed) return rateLimit.response!;

  const { data: before, error: beforeError } = await admin.supabase
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("id", productId)
    .maybeSingle();
  if (beforeError || !before) return jsonResponse({ error: "商品不存在或已被删除" }, 404);

  const { error } = await admin.supabase.from("products").delete().eq("id", productId);
  if (error) {
    await auditCatalogAction({
      request,
      user: admin.user,
      action: "delete_product",
      module: "products",
      targetType: "product",
      targetId: productId,
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
    targetId: productId,
    targetLabel: String((before as { name?: unknown }).name ?? ""),
    result: "success",
    beforeSummary: before,
  });

  revalidateProductCache({
    id: productId,
    slug: String((before as { slug?: unknown }).slug ?? ""),
    categoryId: String((before as { category_id?: unknown }).category_id ?? ""),
  });

  return jsonResponse({ ok: true });
}
