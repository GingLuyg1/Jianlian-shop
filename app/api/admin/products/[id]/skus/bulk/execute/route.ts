import { randomUUID } from "crypto";

import { auditCatalogAction, requireCatalogAdmin } from "../../../../../catalog/_shared";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { inspectCatalogSkuSchema } from "@/lib/products/catalog-readiness.mjs";
import { executeSkuBulkStatusUpdate } from "@/lib/products/admin-sku-bulk-operations.mjs";
import { bulkJson, readSkuBulkOperation } from "../_shared";

function auditSummary(result: Awaited<ReturnType<typeof readSkuBulkOperation>>) {
  if (!result.ok) return null;
  return {
    product_id: result.product.id,
    action: result.preview.action,
    target_status: result.preview.target_status,
    sku_ids: result.skuIds,
    selected_count: result.preview.selected_count,
    will_change_count: result.preview.will_change_count,
    no_change_count: result.preview.no_change_count,
    blocked_count: result.preview.blocked_count,
  };
}

function safeRpcErrorCode(error: { message?: string; code?: string } | null) {
  const known = [
    "BULK_SKU_PRODUCT_ID_REQUIRED", "EMPTY_SKU_SELECTION",
    "SKU_BATCH_LIMIT_EXCEEDED", "NULL_SKU_ID", "DUPLICATE_SKU_ID", "BULK_STATUS_TARGET_NOT_ALLOWED",
    "PRODUCT_NOT_FOUND", "BULK_SKU_OWNERSHIP_MISMATCH",
  ];
  return known.find((code) => error?.message?.includes(code)) ?? (error?.code === "55P03" ? "BULK_STATUS_LOCK_TIMEOUT" : "BULK_STATUS_TRANSACTION_FAILED");
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const requestId = randomUUID();
  const admin = await requireCatalogAdmin(requestId);
  if (!admin.ok) return admin.response;
  const service = getSupabaseServiceRoleClient();
  if (!service) return bulkJson({ error: "SKU 批量操作权限不可用", code: "SERVICE_ROLE_UNAVAILABLE", requestId }, 503, requestId);

  const schemaReadiness = await inspectCatalogSkuSchema(service);
  if (!schemaReadiness.ready) {
    return bulkJson({ error: "SKU schema 尚未就绪，批量操作已安全阻止", code: "CATALOG_SKU_SCHEMA_NOT_READY", requestId }, 503, requestId);
  }

  const body = await request.json().catch(() => null);
  const result = await readSkuBulkOperation(service, params.id, body);
  if (!result.ok) {
    const requestBody = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
    const requestedIds = Array.isArray(requestBody.sku_ids)
      ? requestBody.sku_ids.filter((value): value is string => typeof value === "string").slice(0, 100)
      : [];
    await auditCatalogAction({
      request,
      user: admin.user,
      action: "bulk_update_product_skus",
      module: "products",
      targetType: "product_sku_batch",
      targetId: params.id,
      targetLabel: typeof requestBody.action === "string" ? requestBody.action.slice(0, 80) : "invalid",
      result: "failed",
      beforeSummary: { product_id: params.id, sku_ids: requestedIds, selected_count: requestedIds.length },
      errorMessage: result.code,
    });
    return bulkJson({ error: result.message, code: result.code, requestId }, result.status, requestId);
  }
  const beforeSummary = auditSummary(result);

  if (result.preview.action === "activate") {
    const execution = await executeSkuBulkStatusUpdate({ preview: result.preview });
    await auditCatalogAction({ request, user: admin.user, action: "bulk_update_product_skus", module: "products", targetType: "product_sku_batch", targetId: params.id, targetLabel: result.preview.action, result: "failed", beforeSummary, afterSummary: { updated_count: 0 }, errorMessage: execution.code });
    return bulkJson({ error: "批量激活需要独立的事务型 readiness 保护，当前仅支持预检", code: execution.code, preview: result.preview, updated_count: 0, requestId }, 409, requestId);
  }
  if (!result.preview.can_execute) {
    await auditCatalogAction({ request, user: admin.user, action: "bulk_update_product_skus", module: "products", targetType: "product_sku_batch", targetId: params.id, targetLabel: result.preview.action, result: "failed", beforeSummary, errorMessage: "BULK_OPERATION_BLOCKED" });
    return bulkJson({ error: "批量操作已被检查阻止，请重新预检", code: "BULK_OPERATION_BLOCKED", preview: result.preview, requestId }, 409, requestId);
  }

  try {
    const execution = await executeSkuBulkStatusUpdate({
      preview: result.preview,
      productId: params.id,
      skuIds: result.skuIds,
      runTransaction: async ({ productId, skuIds, targetStatus }) => {
        const { data, error } = await service.rpc("admin_bulk_update_product_sku_status", {
          p_product_id: productId,
          p_sku_ids: skuIds,
          p_target_status: targetStatus,
        });
        if (error) throw Object.assign(new Error(safeRpcErrorCode(error)), { rpcCode: safeRpcErrorCode(error) });
        return data as Record<string, unknown>;
      },
    });
    if (!execution.ok) throw Object.assign(new Error(execution.code), { rpcCode: execution.code });
    await auditCatalogAction({ request, user: admin.user, action: "bulk_update_product_skus", module: "products", targetType: "product_sku_batch", targetId: params.id, targetLabel: result.preview.action, result: "success", beforeSummary, afterSummary: { rpc_success: true, selected_count: execution.selected_count, updated_count: execution.updated_count, no_change_count: execution.no_change_count, product_summary: execution.product_summary } });
    return bulkJson({ ok: true, code: execution.code, updated_count: execution.updated_count, no_change_count: execution.no_change_count, product_summary: execution.product_summary, requestId }, 200, requestId);
  } catch (error) {
    const code = typeof (error as { rpcCode?: unknown })?.rpcCode === "string" ? String((error as { rpcCode: string }).rpcCode) : "BULK_STATUS_TRANSACTION_FAILED";
    await auditCatalogAction({ request, user: admin.user, action: "bulk_update_product_skus", module: "products", targetType: "product_sku_batch", targetId: params.id, targetLabel: result.preview.action, result: "failed", beforeSummary, afterSummary: { updated_count: 0 }, errorMessage: code });
    const stale = code === "BULK_SKU_OWNERSHIP_MISMATCH" || code === "PRODUCT_NOT_FOUND";
    const committedUnknown = code === "BULK_STATUS_COMMITTED_RESPONSE_INVALID";
    const message = stale
      ? "SKU 数据已变化，请重新预检后再执行"
      : committedUnknown
        ? "事务已完成但响应无法确认，请刷新数据后重新预检"
        : "批量 SKU 状态更新失败，事务已回滚";
    return bulkJson({ error: message, code, updated_count: 0, requestId }, stale ? 409 : committedUnknown ? 502 : 503, requestId);
  }
}
