import { randomUUID } from "crypto";

import {
  auditCatalogAction,
  jsonResponse,
  parseBody,
  requireCatalogAdmin,
} from "../../../catalog/_shared";

import { revalidateProductCache } from "@/lib/cache/cache-tags";
import { checkRateLimit, checkRequestSize, getAdminRateLimitKey } from "@/lib/security/rate-limit";
import {
  getSupabaseServiceRoleClient,
  getSupabaseServiceRoleConfiguration,
} from "@/lib/supabase/service-role";

type RouteContext = {
  params: { id: string };
};

type ProductStatus = "draft" | "active" | "inactive" | "sold_out";
type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

const SAFE_PRODUCT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const ALLOWED_STATUSES = ["draft", "active", "inactive", "sold_out"] as const;
const PRODUCT_STATUSES = new Set<string>(ALLOWED_STATUSES);
const STATUS_PRODUCT_FIELDS = "id,status,slug";

function getRequestId(request: Request) {
  return request.headers.get("x-request-id") || request.headers.get("x-correlation-id") || randomUUID();
}

function productFailureResponse(code: string, message: string, requestId: string, status = 400) {
  const response = jsonResponse({ success: false, error: { code, message, request_id: requestId }, request_id: requestId }, status);
  response.headers.set("X-Request-ID", requestId);
  return response;
}

function safeSupabaseError(error: unknown) {
  const next = (error ?? {}) as SupabaseErrorLike;
  return {
    code: typeof next.code === "string" ? next.code : "UNKNOWN",
    message: typeof next.message === "string" ? next.message.slice(0, 240) : "",
    details: typeof next.details === "string" ? next.details.slice(0, 240) : "",
    hint: typeof next.hint === "string" ? next.hint.slice(0, 160) : "",
  };
}

function getStatusSaveFailure(error: unknown) {
  const next = safeSupabaseError(error);
  const message = `${next.message} ${next.details} ${next.hint}`;

  if (next.code === "PGRST116" || /0 rows|multiple rows|no rows|JSON object requested/i.test(message)) {
    return { status: 404, code: "PRODUCT_NOT_UPDATED", message: "商品状态更新失败，没有更新任何记录" };
  }
  if (next.code === "42501" || /row-level security|permission denied|not authorized/i.test(message)) {
    return { status: 403, code: "PRODUCT_STATUS_FORBIDDEN", message: "商品状态更新失败，当前账号没有商品修改权限" };
  }
  if (next.code === "23514" || next.code === "22P02" || /check constraint|invalid input value/i.test(message)) {
    return { status: 400, code: "PRODUCT_INVALID_STATUS", message: "商品状态更新失败，状态值无效" };
  }
  if (next.code === "PGRST204" || /column .* could not be found|schema cache/i.test(message)) {
    return { status: 400, code: "PRODUCT_INVALID_FIELD", message: "商品状态更新失败，商品字段与数据库不匹配" };
  }
  return { status: 500, code: "PRODUCT_STATUS_UPDATE_FAILED", message: "商品状态更新失败，请稍后重试" };
}

function verifyUpdatedStatus(updated: unknown, expectedStatus: ProductStatus) {
  if (!updated || typeof updated !== "object") {
    return "商品状态更新失败，数据库没有返回最新商品";
  }

  return (updated as { status?: unknown }).status === expectedStatus
    ? null
    : "商品状态更新验证失败，请刷新后重试";
}

function logStatusStage(requestId: string, stage: string, details: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === "production") return;
  console.info("[AdminProductStatus]", { requestId, stage, ...details });
}

async function safeAuditStatusAction(input: Parameters<typeof auditCatalogAction>[0]) {
  try {
    await auditCatalogAction(input);
  } catch (error) {
    console.error("[AdminProductStatus] audit failed", {
      targetId: input.targetId,
      action: input.action,
      result: input.result,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const requestId = getRequestId(request);

  try {
    logStatusStage(requestId, "STATUS_UPDATE_START");
    const admin = await requireCatalogAdmin(requestId);
    if (!admin.ok) return admin.response;
    logStatusStage(requestId, "STATUS_AUTH_OK", { adminId: admin.user.id });

    const productId = params.id?.trim();
    if (!productId || !SAFE_PRODUCT_ID_PATTERN.test(productId)) {
      return productFailureResponse("INVALID_PRODUCT_ID", "商品 ID 无效", requestId, 400);
    }
    logStatusStage(requestId, "STATUS_UPDATE_PRODUCT_ID_OK", { productId });

    const sizeError = checkRequestSize(request, 8 * 1024);
    if (sizeError) return sizeError;

    const rateLimit = checkRateLimit("admin_write", getAdminRateLimitKey(admin.user.id, `product_status:${productId}`));
    if (!rateLimit.allowed) return rateLimit.response!;

    const serviceRoleConfiguration = getSupabaseServiceRoleConfiguration();
    if (!serviceRoleConfiguration.valid) {
      console.error("[AdminProductStatus] invalid service role configuration", {
        requestId,
        productId,
        adminId: admin.user.id,
        urlPresent: serviceRoleConfiguration.urlPresent,
        serviceRolePresent: serviceRoleConfiguration.serviceRolePresent,
        keyType: serviceRoleConfiguration.keyType,
        keyRole: serviceRoleConfiguration.jwtRole,
      });
      return productFailureResponse(
        "PRODUCT_STATUS_SERVICE_ROLE_UNAVAILABLE",
        "Supabase service role configuration is unavailable",
        requestId,
        503
      );
    }

    const service = getSupabaseServiceRoleClient();
    if (!service) {
      console.error("[AdminProductStatus] service role unavailable", { requestId, productId, adminId: admin.user.id });
      return productFailureResponse(
        "PRODUCT_SERVICE_ROLE_UNAVAILABLE",
        "商品状态更新失败，服务端缺少 Supabase service role 配置",
        requestId,
        500
      );
    }
    logStatusStage(requestId, "STATUS_ADMIN_CLIENT_OK", {
      serviceRolePresent: serviceRoleConfiguration.serviceRolePresent,
      clientType: "service_role",
    });

    const body = parseBody(await request.json().catch(() => ({})));
    logStatusStage(requestId, "STATUS_REQUEST_PARSED", { fields: Object.keys(body).sort() });
    const status = String(body.status ?? "").trim() as ProductStatus;
    if (!PRODUCT_STATUSES.has(status)) {
      return productFailureResponse("PRODUCT_INVALID_STATUS", "请选择有效的商品状态", requestId, 400);
    }
    logStatusStage(requestId, "STATUS_UPDATE_STATUS_OK", { status });

    logStatusStage(requestId, "STATUS_PRODUCT_READ_START", { productId });
    const { data: before, error: readError } = await service
      .from("products")
      .select(STATUS_PRODUCT_FIELDS)
      .eq("id", productId)
      .maybeSingle();

    if (readError) {
      console.error("[AdminProductStatus] product read failed", {
        requestId,
        productId,
        error: safeSupabaseError(readError),
      });
      return productFailureResponse("PRODUCT_READ_FAILED", "商品读取失败，请稍后重试", requestId, 500);
    }

    if (!before) {
      return productFailureResponse("PRODUCT_NOT_FOUND", "商品不存在或已被删除", requestId, 404);
    }
    logStatusStage(requestId, "STATUS_PRODUCT_READ_OK", {
      productId,
      currentStatus: String((before as { status?: unknown }).status ?? ""),
    });

    const existingId = String((before as { id?: unknown }).id ?? productId);
    logStatusStage(requestId, "STATUS_PRODUCT_UPDATE_START", { productId, status });
    const { data: updated, error: updateError } = await service
      .from("products")
      .update({ status })
      .eq("id", existingId)
      .select("id,status,slug")
      .maybeSingle();

    if (updateError || !updated) {
      const failure = getStatusSaveFailure(updateError);
      console.error("[AdminProductStatus] update failed", {
        requestId,
        productId,
        status,
        error: safeSupabaseError(updateError),
      });
      await safeAuditStatusAction({
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
    logStatusStage(requestId, "STATUS_PRODUCT_UPDATE_OK", {
      productId,
      nextStatus: String((updated as { status?: unknown }).status ?? ""),
    });

    const verifyError = verifyUpdatedStatus(updated, status);
    if (verifyError) {
      return productFailureResponse("PRODUCT_STATUS_VERIFY_FAILED", verifyError, requestId, 409);
    }
    logStatusStage(requestId, "STATUS_PERSISTENCE_CHECK_OK", { productId });

    logStatusStage(requestId, "STATUS_CACHE_START", { productId });
    revalidateProductCache({
      id: existingId,
      slug: String((updated as { slug?: unknown }).slug ?? ""),
      previousSlug: String((before as { slug?: unknown }).slug ?? ""),
      categoryId: String((updated as { category_id?: unknown }).category_id ?? ""),
      previousCategoryId: String((before as { category_id?: unknown }).category_id ?? ""),
    });
    logStatusStage(requestId, "STATUS_CACHE_DONE", { productId });

    logStatusStage(requestId, "STATUS_AUDIT_START", { productId });
    await safeAuditStatusAction({
      request,
      user: admin.user,
      action: "update_product_status",
      module: "products",
      targetType: "product",
      targetId: productId,
      targetLabel: String((updated as { name?: unknown }).name ?? ""),
      result: "success",
      beforeSummary: before,
      afterSummary: updated,
    });
    logStatusStage(requestId, "STATUS_AUDIT_DONE", { productId });

    logStatusStage(requestId, "STATUS_RESPONSE_START", { productId });
    const response = jsonResponse({ success: true, data: { product: updated }, product: updated, request_id: requestId });
    response.headers.set("X-Request-ID", requestId);
    logStatusStage(requestId, "STATUS_UPDATE_RESPONSE_OK", { productId });
    return response;
  } catch (error) {
    console.error("[AdminProductStatus] unexpected failure", {
      requestId,
      error: error instanceof Error ? error.message : "unknown",
      stack: process.env.NODE_ENV === "production" ? undefined : error instanceof Error ? error.stack : undefined,
    });
    return productFailureResponse("PRODUCT_STATUS_UNEXPECTED_ERROR", "商品状态更新失败，请稍后重试", requestId, 500);
  }
}
