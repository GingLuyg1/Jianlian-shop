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
import { POSTGREST_PAGE_SIZE, selectAllPaginated } from "@/lib/supabase/paginated-select";
import {
  decorateAdminCatalogProducts,
  filterAndPaginateAdminCatalogProducts,
  hasOperationalScanFilters,
  parseAdminCatalogOperationFilters,
} from "@/lib/products/admin-catalog-operations.mjs";
import { readSkuLocalInventoryDiagnostics } from "@/lib/products/fulfillment-inventory-diagnostics.mjs";
import type { SupabaseClient } from "@supabase/supabase-js";

const SKU_OPERATION_FIELDS = "id,product_id,sku_code,sku_title,status,stock,delivery_type,metadata";
const PRODUCT_SCAN_LIMIT = 5000;
const SKU_PRODUCT_BATCH_SIZE = 200;
const SKU_BATCH_ROW_LIMIT = 5000;

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

async function readOperationalSkuRows(service: SupabaseClient, productIds: string[]) {
  if (productIds.length === 0) return { rows: [] as Array<Record<string, unknown>>, queryCount: 0 };
  const batches: string[][] = [];
  for (let index = 0; index < productIds.length; index += SKU_PRODUCT_BATCH_SIZE) {
    batches.push(productIds.slice(index, index + SKU_PRODUCT_BATCH_SIZE));
  }
  const skuFields = (
    getSupabaseServiceRoleClient()
      ? SKU_OPERATION_FIELDS
      : SKU_OPERATION_FIELDS.replace(",metadata", "")
  ) as typeof SKU_OPERATION_FIELDS;

  const batchResults = await Promise.all(
    batches.map((ids) =>
      selectAllPaginated<Record<string, unknown>>(
        (rangeFrom, rangeTo) =>
          service
            .from("product_skus")
            .select(skuFields, { count: "exact" })
            .in("product_id", ids)
            .order("id", { ascending: true })
            .range(rangeFrom, rangeTo) as unknown as PromiseLike<{
            data: Array<Record<string, unknown>> | null;
            error: { code?: string; message?: string } | null;
            count?: number | null;
          }>,
        { pageSize: POSTGREST_PAGE_SIZE, maxRows: SKU_BATCH_ROW_LIMIT }
      )
    )
  );

  const rows: Array<Record<string, unknown>> = [];
  let totalQueries = 0;
  for (const result of batchResults) {
    totalQueries += result.queryCount;
    if (result.error) return { rows: [], queryCount: totalQueries, error: result.error };
    if (result.truncated || (result.totalCount !== null && result.totalCount > SKU_BATCH_ROW_LIMIT)) {
      return { rows: [], queryCount: totalQueries, overflow: true };
    }
    rows.push(...result.rows);
  }
  return { rows, queryCount: totalQueries };
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const admin = await requireCatalogAdmin(requestId);
  if (!admin.ok) return admin.response;
  const service = getSupabaseServiceRoleClient() ?? admin.supabase;

  const url = new URL(request.url);
  const parsedFilters = parseAdminCatalogOperationFilters(url.searchParams);
  if (!parsedFilters.ok) {
    return productFailureResponse(
      "PRODUCT_INVALID_FILTER",
      `未知的商品筛选条件：${parsedFilters.invalid.join(", ")}`,
      requestId,
      400
    );
  }
  const filters = parsedFilters.filters;
  const search = filters.search;
  const categoryId = (url.searchParams.get("categoryId") ?? "all").trim();
  const categoryIds = (url.searchParams.get("categoryIds") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 100);
  const status = filters.productStatus;
  const deliveryType = filters.deliveryType;
  const sortBy = filters.sortBy;
  const page = filters.page;
  const pageSize = filters.pageSize;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const operationalScan = hasOperationalScanFilters(filters);
  const liteMode = !operationalScan && url.searchParams.get("lite") === "1";

  const selectFields = (
    getSupabaseServiceRoleClient()
      ? PRODUCT_FIELDS
      : PRODUCT_FIELDS.replace(",metadata,", ",")
  ) as typeof PRODUCT_FIELDS;
  const buildProductsQuery = () => {
    let q = service.from("products").select(selectFields, { count: "exact" });
    if (search) {
      const escaped = search.replace(/[%,()\\]/g, "").trim();
      if (escaped) q = q.or(`name.ilike.%${escaped}%,slug.ilike.%${escaped}%`);
    }
    if (categoryId && categoryId !== "all") {
      q = q.eq("category_id", categoryId);
    } else if (categoryIds.length > 0) {
      q = q.in("category_id", categoryIds);
    }
    if (status && status !== "all") q = q.eq("status", status);
    if (deliveryType && deliveryType !== "all" && !operationalScan) q = q.eq("delivery_type", deliveryType);
    if (filters.productType === "multi_sku") q = q.eq("has_skus", true);
    if (filters.productType === "single_product") q = q.eq("has_skus", false);

    const ordered =
      sortBy === "updated_at"
        ? q.order("updated_at", { ascending: false }).order("sort_order", { ascending: true })
        : q.order("sort_order", { ascending: true }).order("updated_at", { ascending: false });
    return ordered.order("id", { ascending: true });
  };

  let productRows: Array<Record<string, unknown>> = [];
  let count: number | null = null;
  let productQueryCount = 1;

  if (operationalScan) {
    const scanResult = await selectAllPaginated<Record<string, unknown>>(
      (rangeFrom, rangeTo) =>
        buildProductsQuery().range(rangeFrom, rangeTo) as unknown as PromiseLike<{
          data: Array<Record<string, unknown>> | null;
          error: { code?: string; message?: string } | null;
          count?: number | null;
        }>,
      { pageSize: POSTGREST_PAGE_SIZE, maxRows: PRODUCT_SCAN_LIMIT }
    );
    productQueryCount = scanResult.queryCount;
    if (scanResult.error) {
      console.error("[AdminProductList] read failed", {
        requestId,
        code: scanResult.error.code,
        message: scanResult.error.message,
      });
      return productFailureResponse("PRODUCT_LIST_READ_FAILED", "商品列表读取失败，请稍后重试", requestId, 500);
    }
    count = scanResult.totalCount;
    if ((count ?? 0) > PRODUCT_SCAN_LIMIT) {
      return productFailureResponse(
        "PRODUCT_FILTER_SCOPE_TOO_LARGE",
        "当前筛选范围过大，请先增加搜索、分类或商品状态条件",
        requestId,
        400
      );
    }
    if (scanResult.truncated || count === null || count !== scanResult.rows.length) {
      return productFailureResponse("PRODUCT_FILTER_SCAN_INCOMPLETE", "筛选数据未完整返回，请缩小范围后重试", requestId, 503);
    }
    productRows = scanResult.rows;
  } else {
    const { data, error, count: singleCount } = await buildProductsQuery().range(from, to);
    if (error) {
      console.error("[AdminProductList] read failed", { requestId, code: error.code, message: error.message });
      return productFailureResponse("PRODUCT_LIST_READ_FAILED", "商品列表读取失败，请稍后重试", requestId, 500);
    }
    productRows = (data ?? []) as Array<Record<string, unknown>>;
    count = singleCount ?? 0;
  }

  if (liteMode) {
    const response = jsonResponse({
      success: true,
      data: { products: productRows, count: count ?? 0, query_count: productQueryCount },
      products: productRows,
      count: count ?? 0,
      query_count: productQueryCount,
      request_id: requestId,
    });
    response.headers.set("X-Request-ID", requestId);
    return response;
  }

  const multiSkuProductIds = productRows
    .filter((row) => row.has_skus === true)
    .map((row) => String(row.id));
  const skuResult = await readOperationalSkuRows(service, multiSkuProductIds);
  if (skuResult.error || skuResult.overflow) {
    console.error("[AdminProductList] SKU operations read failed", {
      requestId,
      code: skuResult.error?.code ?? (skuResult.overflow ? "SKU_FILTER_SCOPE_TOO_LARGE" : "UNKNOWN"),
    });
    return productFailureResponse(
      skuResult.overflow ? "SKU_FILTER_SCOPE_TOO_LARGE" : "PRODUCT_SKU_SUMMARY_READ_FAILED",
      skuResult.overflow ? "SKU 筛选范围过大，请缩小商品范围" : "SKU 运营状态读取失败，请稍后重试",
      requestId,
      skuResult.overflow ? 400 : 500
    );
  }
  const needsFullInventoryScan = operationalScan && filters.fulfillmentHealth !== "all";
  let products: Array<Record<string, unknown>> = [];
  let filteredCount = 0;
  let inventoryResult: Awaited<ReturnType<typeof readSkuLocalInventoryDiagnostics>>;

  if (operationalScan && !needsFullInventoryScan) {
    const preFiltered = filterAndPaginateAdminCatalogProducts(productRows, skuResult.rows, filters, {});
    filteredCount = preFiltered.count;
    const pageProductIds = new Set(preFiltered.products.map((item) => String(item.id)));
    const pageSkuRows = skuResult.rows.filter((row) => pageProductIds.has(String(row.product_id ?? "")));
    inventoryResult = await readSkuLocalInventoryDiagnostics(service, pageSkuRows);
    if (inventoryResult.error) {
      console.warn("[AdminProductList] local inventory diagnostics unavailable; response will fail closed", {
        requestId,
        overflow: inventoryResult.overflow,
      });
    }
    const pageInventoryContext = {
      availableBySku: inventoryResult.availableBySku,
      error: inventoryResult.error,
    };
    products = decorateAdminCatalogProducts(preFiltered.products, pageSkuRows, filters, pageInventoryContext);
  } else {
    inventoryResult = await readSkuLocalInventoryDiagnostics(service, skuResult.rows);
    if (inventoryResult.error) {
      console.warn("[AdminProductList] local inventory diagnostics unavailable; response will fail closed", {
        requestId,
        overflow: inventoryResult.overflow,
      });
    }
    const inventoryContext = {
      availableBySku: inventoryResult.availableBySku,
      error: inventoryResult.error,
    };
    const filtered = operationalScan
      ? filterAndPaginateAdminCatalogProducts(productRows, skuResult.rows, filters, inventoryContext)
      : { products: decorateAdminCatalogProducts(productRows, skuResult.rows, filters, inventoryContext), count: count ?? 0 };
    products = filtered.products;
    filteredCount = filtered.count;
  }
  const queryCount = productQueryCount + skuResult.queryCount + inventoryResult.queryCount;

  const response = jsonResponse({
    success: true,
    data: { products, count: filteredCount, query_count: queryCount },
    products,
    count: filteredCount,
    query_count: queryCount,
    request_id: requestId,
  });
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

  const categoryError = await assertProductCategory(service, payload.category_id as string, payload.status);
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
