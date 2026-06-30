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

import { markMediaReferenceByUrl } from "@/lib/media/media-service";
import { checkRateLimit, checkRequestSize, getAdminRateLimitKey } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const admin = await requireCatalogAdmin();
  if (!admin.ok) return admin.response;

  const sizeError = checkRequestSize(request, 64 * 1024);
  if (sizeError) return sizeError;

  const rateLimit = checkRateLimit("admin_write", getAdminRateLimitKey(admin.user.id, "product_create"));
  if (!rateLimit.allowed) return rateLimit.response!;

  const body = parseBody(await request.json().catch(() => ({})));
  const { payload, errors } = normalizeProductPayload(body);
  if (Object.keys(errors).length > 0) {
    return jsonResponse({ error: "商品信息填写不完整", errors }, 400);
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
      errorMessage: "商品新增失败",
    });
    return jsonResponse({ error: "商品新增失败，请检查商品标识是否重复" }, 400);
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

  await markMediaReferenceByUrl(admin.supabase, (data as { image_url?: string | null }).image_url, "product", String((data as { id?: unknown }).id ?? ""));

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
