import { randomUUID } from "crypto";

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
import { revalidateProductCache } from "@/lib/cache/cache-tags";
import { checkRateLimit, checkRequestSize, getAdminRateLimitKey } from "@/lib/security/rate-limit";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";


function getRequestId(request: Request) {
  return request.headers.get("x-request-id") || request.headers.get("x-correlation-id") || randomUUID();
}

function productFailureResponse(code: string, message: string, requestId: string, status = 400) {
  const response = jsonResponse({ success: false, error: { code, message, request_id: requestId }, request_id: requestId }, status);
  response.headers.set("X-Request-ID", requestId);
  return response;
}

function safeSupabaseError(error: unknown) {
  const next = (error ?? {}) as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  return {
    code: typeof next.code === "string" ? next.code : "UNKNOWN",
    message: typeof next.message === "string" ? next.message.slice(0, 240) : "",
    details: typeof next.details === "string" ? next.details.slice(0, 240) : "",
    hint: typeof next.hint === "string" ? next.hint.slice(0, 160) : "",
  };
}

function getQueryInteger(value: string | null, fallback: number, min: number, max: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(next)));
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const admin = await requireCatalogAdmin(requestId);
  if (!admin.ok) return admin.response;
  const service = getSupabaseServiceRoleClient() ?? admin.supabase;

  const url = new URL(request.url);
  const search = (url.searchParams.get("search") ?? "").trim();
  const categoryId = (url.searchParams.get("categoryId") ?? "all").trim();
  const categoryIds = (url.searchParams.get("categoryIds") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 100);
  const status = (url.searchParams.get("status") ?? "all").trim();
  const deliveryType = (url.searchParams.get("deliveryType") ?? "all").trim();
  const sortBy = (url.searchParams.get("sortBy") ?? "sort_order").trim();
  const page = getQueryInteger(url.searchParams.get("page"), 1, 1, 100000);
  const pageSize = getQueryInteger(url.searchParams.get("pageSize"), 20, 1, 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = service.from("products").select(PRODUCT_FIELDS, { count: "exact" });

  if (search) {
    const escaped = search.replace(/[%,]/g, "");
    query = query.or(`name.ilike.%${escaped}%,slug.ilike.%${escaped}%`);
  }
  if (categoryId && categoryId !== "all") {
    query = query.eq("category_id", categoryId);
  } else if (categoryIds.length > 0) {
    query = query.in("category_id", categoryIds);
  }
  if (status && status !== "all") query = query.eq("status", status);
  if (deliveryType && deliveryType !== "all") query = query.eq("delivery_type", deliveryType);

  const sortedQuery =
    sortBy === "updated_at"
      ? query.order("updated_at", { ascending: false }).order("sort_order", { ascending: true })
      : query.order("sort_order", { ascending: true }).order("updated_at", { ascending: false });

  const { data, error, count } = await sortedQuery.range(from, to);
  if (error) {
    console.error("[AdminProductList] read failed", { requestId, code: error.code, message: error.message });
    return productFailureResponse("PRODUCT_LIST_READ_FAILED", "商品列表读取失败，请稍后重试", requestId, 500);
  }

  const response = jsonResponse({ success: true, data: { products: data ?? [], count: count ?? 0 }, products: data ?? [], count: count ?? 0, request_id: requestId });
  response.headers.set("X-Request-ID", requestId);
  return response;
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const admin = await requireCatalogAdmin(requestId);
  if (!admin.ok) return admin.response;

  const sizeError = checkRequestSize(request, 64 * 1024);
  if (sizeError) return sizeError;

  const rateLimit = checkRateLimit("admin_write", getAdminRateLimitKey(admin.user.id, "product_create"));
  if (!rateLimit.allowed) return rateLimit.response!;

  const body = parseBody(await request.json().catch(() => ({})));
  const { payload, errors } = normalizeProductPayload(body);
  if (Object.keys(errors).length > 0) {
    return productFailureResponse("PRODUCT_VALIDATION_FAILED", "商品信息填写不完整", requestId, 400);
  }

  const serviceRole = getSupabaseServiceRoleClient();
  if (!serviceRole) {
    console.error("[AdminProductCreate] service role unavailable", {
      requestId,
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

  const categoryError = await assertProductCategory(service, payload.category_id as string);
  if (categoryError) return productFailureResponse("PRODUCT_INVALID_CATEGORY", categoryError, requestId, 400);

  const { data, error } = await service.from("products").insert(payload).select(PRODUCT_FIELDS).single();
  if (error) {
    console.error("[AdminProductCreate] insert failed", {
      requestId,
      fields: Object.keys(payload).sort(),
      error: safeSupabaseError(error),
    });
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
    const duplicate = error.code === "23505" || /duplicate|unique/i.test(error.message);
    return productFailureResponse(
      duplicate ? "PRODUCT_DUPLICATE_SLUG" : "PRODUCT_CREATE_FAILED",
      duplicate ? "商品保存失败，请检查商品标识是否重复。" : "商品保存失败，请检查输入后重试。",
      requestId,
      duplicate ? 400 : 500
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
    console.error("[AdminProductCreate] persisted verification failed", {
      requestId,
      productId: String((data as { id?: unknown }).id ?? ""),
      message: verifyError,
    });
    return productFailureResponse("PRODUCT_VERIFY_FAILED", verifyError, requestId, 409);
  }

  await markMediaReferenceByUrl(service, (data as { image_url?: string | null }).image_url, "product", String((data as { id?: unknown }).id ?? ""));
  revalidateProductCache({
    id: String((data as { id?: unknown }).id ?? ""),
    slug: String((data as { slug?: unknown }).slug ?? ""),
    categoryId: String((data as { category_id?: unknown }).category_id ?? ""),
  });

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

  const response = jsonResponse({ success: true, data: { product: data }, product: data, request_id: requestId }, 201);
  response.headers.set("X-Request-ID", requestId);
  return response;
}
