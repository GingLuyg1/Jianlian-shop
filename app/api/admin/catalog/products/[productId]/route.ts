import { randomUUID } from "crypto";

import {
  PRODUCT_FIELDS,
  auditCatalogAction,
  assertProductCategory,
  jsonResponse,
  normalizeProductUpdatePayload,
  parseBody,
  requireCatalogAdmin,
  verifyPersistedProduct,
} from "../../_shared";

import { revalidateProductCache } from "@/lib/cache/cache-tags";
import { markMediaReferenceByUrl } from "@/lib/media/media-service";
import { checkRateLimit, checkRequestSize, getAdminRateLimitKey } from "@/lib/security/rate-limit";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type RouteContext = {
  params: { productId: string };
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

const SAFE_PRODUCT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

function getRequestId(request: Request) {
  return request.headers.get("x-request-id") || request.headers.get("x-correlation-id") || randomUUID();
}

function isSafeProductId(value: string) {
  return SAFE_PRODUCT_ID_PATTERN.test(value);
}

function safeSupabaseError(error: unknown) {
  const next = (error ?? {}) as SupabaseErrorLike;
  return {
    code: next.code ?? "UNKNOWN",
    message: next.message ? String(next.message).slice(0, 240) : "",
    details: next.details ? String(next.details).slice(0, 240) : "",
    hint: next.hint ? String(next.hint).slice(0, 160) : "",
  };
}

function productFailureResponse(
  code: string,
  message: string,
  requestId: string,
  status = 400,
  errors?: Record<string, string>
) {
  const response = jsonResponse(
    {
      success: false,
      error: {
        code,
        message,
        request_id: requestId,
      },
      errors,
      request_id: requestId,
    },
    status
  );
  response.headers.set("X-Request-ID", requestId);
  return response;
}

function getProductSaveFailure(error: unknown, fallback = "商品保存失败，请检查输入后重试") {
  const message = (error as { message?: string; code?: string } | null | undefined)?.message ?? "";
  const code = (error as { code?: string } | null | undefined)?.code ?? "";

  if (code === "PGRST116" || /0 rows|multiple rows|no rows|JSON object requested/i.test(message)) {
    return { status: 404, code: "PRODUCT_NOT_UPDATED", message: "商品保存失败，没有更新任何记录" };
  }
  if (code === "23505" || /duplicate|unique/i.test(message)) {
    return { status: 400, code: "PRODUCT_DUPLICATE_SLUG", message: "商品保存失败，请检查商品标识是否重复" };
  }
  if (code === "23503" || /foreign key/i.test(message)) {
    return { status: 400, code: "PRODUCT_INVALID_CATEGORY", message: "商品保存失败，分类无效" };
  }
  if (code === "42501" || /row-level security|permission denied|not authorized/i.test(message)) {
    return { status: 403, code: "PRODUCT_UPDATE_FORBIDDEN", message: "商品保存失败，当前账号没有商品修改权限" };
  }
  if (code === "PGRST204" || /column .* could not be found|schema cache/i.test(message)) {
    return { status: 400, code: "PRODUCT_INVALID_FIELD", message: "商品保存失败，提交字段与数据库不匹配" };
  }
  return { status: 500, code: "PRODUCT_UPDATE_FAILED", message: fallback };
}


export async function GET(request: Request, { params }: RouteContext) {
  const requestId = getRequestId(request);
  const admin = await requireCatalogAdmin(requestId);
  if (!admin.ok) return admin.response;
  const service = getSupabaseServiceRoleClient() ?? admin.supabase;

  const productId = params.productId?.trim();
  if (!productId || !isSafeProductId(productId)) {
    return productFailureResponse("INVALID_PRODUCT_ID", "商品 ID 无效", requestId, 400);
  }

  const { data, error } = await service
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    console.error("[AdminProductRead] product read failed", {
      requestId,
      productId,
      error: safeSupabaseError(error),
    });
    return productFailureResponse("PRODUCT_READ_FAILED", "商品读取失败，请稍后重试", requestId, 500);
  }
  if (!data) {
    return productFailureResponse("PRODUCT_NOT_FOUND", "商品不存在或已被删除", requestId, 404);
  }

  const response = jsonResponse({ success: true, data: { product: data }, product: data, request_id: requestId });
  response.headers.set("X-Request-ID", requestId);
  return response;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const requestId = getRequestId(request);
  const admin = await requireCatalogAdmin(requestId);
  if (!admin.ok) return admin.response;

  const productId = params.productId?.trim();
  if (!productId || !isSafeProductId(productId)) {
    return productFailureResponse("INVALID_PRODUCT_ID", "商品 ID 无效", requestId, 400);
  }

  const sizeError = checkRequestSize(request, 64 * 1024);
  if (sizeError) return sizeError;

  const rateLimit = checkRateLimit("admin_write", getAdminRateLimitKey(admin.user.id, `product_update:${productId}`));
  if (!rateLimit.allowed) return rateLimit.response!;

  // Authentication and role checks use the caller session above. The actual
  // catalog write uses a server-only client because products RLS intentionally
  // exposes public reads but no browser-side write policy.
  const serviceRole = getSupabaseServiceRoleClient();
  if (!serviceRole) {
    console.error("[AdminProductUpdate] service role unavailable", {
      requestId,
      productId,
      adminId: admin.user.id,
    });
    return productFailureResponse(
      "PRODUCT_SERVICE_ROLE_UNAVAILABLE",
      "商品保存失败，本地服务端缺少 Supabase service role 配置，无法写入商品表。",
      requestId,
      500
    );
  }
  const service = serviceRole;

  const { data: before, error: beforeError } = await service
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("id", productId)
    .maybeSingle();

  if (beforeError) {
    console.error("[AdminProductUpdate] product read failed", {
      requestId,
      productId,
      error: safeSupabaseError(beforeError),
    });
    return productFailureResponse("PRODUCT_READ_FAILED", "商品读取失败，请稍后重试", requestId, 500);
  }
  if (!before) {
    return productFailureResponse("PRODUCT_NOT_FOUND", "商品不存在或已被删除", requestId, 404);
  }

  const body = parseBody(await request.json().catch(() => ({})));
  const { payload, errors } = normalizeProductUpdatePayload(body);

  if (Object.keys(errors).length > 0) {
    return productFailureResponse("PRODUCT_VALIDATION_FAILED", "商品信息填写不完整", requestId, 400, errors);
  }
  if (Object.keys(payload).length === 0) {
    return productFailureResponse("PRODUCT_NO_CHANGES", "没有需要保存的商品变更", requestId, 400);
  }

  if (payload.category_id) {
    const categoryError = await assertProductCategory(service, payload.category_id);
    if (categoryError) {
      return productFailureResponse("PRODUCT_INVALID_CATEGORY", categoryError, requestId, 400);
    }
  }

  console.info("[AdminProductUpdate] update payload", {
    requestId,
    productId,
    fields: Object.keys(payload).sort(),
    fieldTypes: Object.fromEntries(
      Object.entries(payload).map(([key, value]) => [key, value === null ? "null" : typeof value])
    ),
  });

  const { data, error } = await service
    .from("products")
    .update(payload)
    .eq("id", productId)
    .select(PRODUCT_FIELDS)
    .single();

  if (error || !data) {
    const failure = getProductSaveFailure(error, "商品保存失败，请检查输入后重试");
    console.error("[AdminProductUpdate] update failed", {
      requestId,
      productId,
      fields: Object.keys(payload).sort(),
      error: safeSupabaseError(error),
    });
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
      errorMessage: `${failure.code}:${failure.message}`,
    });
    return productFailureResponse(failure.code, failure.message, requestId, failure.status);
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
    return productFailureResponse("PRODUCT_VERIFY_FAILED", verifyError, requestId, 409);
  }

  try {
    await markMediaReferenceByUrl(service, (data as { image_url?: string | null }).image_url, "product", productId);
  } catch (mediaError) {
    console.warn("[AdminProductUpdate] media reference skipped", {
      requestId,
      productId,
      error: safeSupabaseError(mediaError),
    });
  }

  try {
    revalidateProductCache({
      id: productId,
      slug: String((data as { slug?: unknown }).slug ?? ""),
      previousSlug: String((before as { slug?: unknown }).slug ?? ""),
      categoryId: String((data as { category_id?: unknown }).category_id ?? ""),
      previousCategoryId: String((before as { category_id?: unknown }).category_id ?? ""),
    });
  } catch (cacheError) {
    console.warn("[AdminProductUpdate] cache revalidate skipped", {
      requestId,
      productId,
      error: safeSupabaseError(cacheError),
    });
  }

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

  const response = jsonResponse({ success: true, data: { product: data }, product: data, request_id: requestId });
  response.headers.set("X-Request-ID", requestId);
  return response;
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const requestId = getRequestId(request);
  const admin = await requireCatalogAdmin(requestId);
  if (!admin.ok) return admin.response;

  const productId = params.productId?.trim();
  if (!productId || !isSafeProductId(productId)) {
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
