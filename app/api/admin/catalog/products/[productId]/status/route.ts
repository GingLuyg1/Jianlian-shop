import { randomUUID } from "crypto";

import {
  PRODUCT_FIELDS,
  auditCatalogAction,
  jsonResponse,
  normalizeProductUpdatePayload,
  parseBody,
  requireCatalogAdmin,
  verifyPersistedProduct,
} from "../../../_shared";

import { revalidateProductCache } from "@/lib/cache/cache-tags";
import { checkRateLimit, checkRequestSize, getAdminRateLimitKey } from "@/lib/security/rate-limit";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type RouteContext = {
  params: { productId: string };
};

type ProductStatus = "draft" | "active" | "inactive" | "sold_out";
type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

const SAFE_PRODUCT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const PRODUCT_STATUSES = new Set<ProductStatus>(["draft", "active", "inactive", "sold_out"]);

function getRequestId(request: Request) {
  return request.headers.get("x-request-id") || request.headers.get("x-correlation-id") || randomUUID();
}

function productFailureResponse(code: string, message: string, requestId: string, status = 400) {
  const response = jsonResponse({ success: false, error: { code, message, request_id: requestId }, request_id: requestId }, status);
  response.headers.set("X-Request-ID", requestId);
  return response;
}

function getStatusSaveFailure(error: unknown) {
  const next = (error ?? {}) as SupabaseErrorLike;
  const code = next.code ?? "";
  const message = next.message ?? "";

  if (code === "PGRST116" || /0 rows|multiple rows|no rows|JSON object requested/i.test(message)) {
    return { status: 404, code: "PRODUCT_NOT_UPDATED", message: "商品状态更新失败，没有更新任何记录" };
  }
  if (code === "42501" || /row-level security|permission denied|not authorized/i.test(message)) {
    return { status: 403, code: "PRODUCT_STATUS_FORBIDDEN", message: "商品状态更新失败，当前账号没有商品修改权限" };
  }
  if (code === "23514" || /check constraint/i.test(message)) {
    return { status: 400, code: "PRODUCT_INVALID_STATUS", message: "商品状态更新失败，状态值无效" };
  }
  return { status: 500, code: "PRODUCT_STATUS_UPDATE_FAILED", message: "商品状态更新失败，请稍后重试" };
}

export async function POST(request: Request, { params }: RouteContext) {
  const requestId = getRequestId(request);
  const admin = await requireCatalogAdmin(requestId);
  if (!admin.ok) return admin.response;

  const serviceRole = getSupabaseServiceRoleClient();
  const service = serviceRole ?? admin.supabase;
  if (!serviceRole) {
    console.warn("[AdminProductStatus] service role unavailable, falling back to admin session client", {
      requestId,
      productId: params.productId?.trim() ?? "",
      adminId: admin.user.id,
    });
  }

  const productId = params.productId?.trim();
  if (!productId || !SAFE_PRODUCT_ID_PATTERN.test(productId)) {
    return productFailureResponse("INVALID_PRODUCT_ID", "商品 ID 无效", requestId, 400);
  }

  const sizeError = checkRequestSize(request, 8 * 1024);
  if (sizeError) return sizeError;

  const rateLimit = checkRateLimit("admin_write", getAdminRateLimitKey(admin.user.id, `product_status:${productId}`));
  if (!rateLimit.allowed) return rateLimit.response!;

  const body = parseBody(await request.json().catch(() => ({})));
  const status = String(body.status ?? "").trim() as ProductStatus;
  if (!PRODUCT_STATUSES.has(status)) {
    return productFailureResponse("PRODUCT_INVALID_STATUS", "请选择有效的商品状态", requestId, 400);
  }

  const { data: before, error: beforeError } = await service
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("id", productId)
    .maybeSingle();

  if (beforeError) {
    console.error("[AdminProductStatus] product read failed", { requestId, productId, code: beforeError.code });
    return productFailureResponse("PRODUCT_READ_FAILED", "商品读取失败，请稍后重试", requestId, 500);
  }
  if (!before) {
    return productFailureResponse("PRODUCT_NOT_FOUND", "商品不存在或已被删除", requestId, 404);
  }

  const { payload, errors } = normalizeProductUpdatePayload({ status });
  if (Object.keys(errors).length > 0 || payload.status !== status) {
    return productFailureResponse("PRODUCT_INVALID_STATUS", "请选择有效的商品状态", requestId, 400);
  }

  const { data, error } = await service
    .from("products")
    .update({ status })
    .eq("id", productId)
    .select(PRODUCT_FIELDS)
    .single();

  if (error || !data) {
    const failure = getStatusSaveFailure(error);
    console.error("[AdminProductStatus] update failed", {
      requestId,
      productId,
      status,
      code: error?.code ?? "NO_DATA",
      message: error?.message,
    });
    await auditCatalogAction({
      request,
      user: admin.user,
      action: "update_product_status",
      module: "products",
      targetType: "product",
      targetId: productId,
      targetLabel: String((before as { name?: unknown }).name ?? ""),
      result: "failed",
      beforeSummary: before,
      afterSummary: { status },
      errorMessage: `${failure.code}:${failure.message}`,
    });
    return productFailureResponse(failure.code, failure.message, requestId, failure.status);
  }

  const verifyError = verifyPersistedProduct(data, { status });
  if (verifyError) {
    return productFailureResponse("PRODUCT_STATUS_VERIFY_FAILED", verifyError, requestId, 409);
  }

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
    action: "update_product_status",
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
