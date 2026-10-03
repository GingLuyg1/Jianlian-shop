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

  if (!result.preview.can_execute) {
    await auditCatalogAction({ request, user: admin.user, action: "bulk_update_product_skus", module: "products", targetType: "product_sku_batch", targetId: params.id, targetLabel: result.preview.action, result: "failed", beforeSummary, errorMessage: "BULK_OPERATION_BLOCKED" });
    return bulkJson({ error: "批量操作已被 readiness 检查阻止，请重新预检", code: "BULK_OPERATION_BLOCKED", preview: result.preview, requestId }, 409, requestId);
  }
  const execution = await executeSkuBulkStatusUpdate({ preview: result.preview });
  await auditCatalogAction({ request, user: admin.user, action: "bulk_update_product_skus", module: "products", targetType: "product_sku_batch", targetId: params.id, targetLabel: result.preview.action, result: "failed", beforeSummary, afterSummary: { updated_count: 0 }, errorMessage: execution.code });
  const message = execution.code === "BULK_ACTIVATION_DEFERRED_FOR_ATOMICITY"
    ? "批量激活需要事务型原子保护，当前仅支持预检"
    : "当前仅支持批量预检；安全的批量状态写入将在事务型后端完成后开放";
  return bulkJson({ error: message, code: execution.code, preview: result.preview, updated_count: 0, requestId }, 409, requestId);
}
