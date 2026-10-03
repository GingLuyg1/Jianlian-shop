import { randomUUID } from "crypto";

import { auditCatalogAction, requireCatalogAdmin } from "../../../../../catalog/_shared";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { inspectCatalogSkuSchema } from "@/lib/products/catalog-readiness.mjs";
import { executeSkuBulkStatusUpdate } from "@/lib/products/admin-sku-bulk-operations.mjs";
import { syncSkuProductSummary } from "@/lib/products/sku-summary";
import { BULK_SKU_FIELDS, bulkJson, readSkuBulkOperation } from "../_shared";

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
  if (!result.preview.execution_supported || result.preview.action === "activate") {
    await auditCatalogAction({ request, user: admin.user, action: "bulk_activate_product_skus", module: "products", targetType: "product_sku_batch", targetId: params.id, targetLabel: "activate", result: "failed", beforeSummary, errorMessage: "BULK_ACTIVATION_DEFERRED_FOR_ATOMICITY" });
    return bulkJson({ error: "批量激活需要事务型原子保护，当前仅支持预检", code: "BULK_ACTIVATION_DEFERRED_FOR_ATOMICITY", preview: result.preview, requestId }, 409, requestId);
  }

  let execution;
  try {
    execution = await executeSkuBulkStatusUpdate({
      preview: result.preview,
      updateStatuses: async (skuIds, targetStatus) => {
        const { data, error } = await service
          .from("product_skus")
          .update({ status: targetStatus })
          .eq("product_id", params.id)
          .in("id", skuIds)
          .select(BULK_SKU_FIELDS);
        if (error) throw new Error("BULK_UPDATE_FAILED");
        return data ?? [];
      },
    });
  } catch (error) {
    await auditCatalogAction({ request, user: admin.user, action: "bulk_update_product_skus", module: "products", targetType: "product_sku_batch", targetId: params.id, targetLabel: result.preview.action, result: "failed", beforeSummary, errorMessage: error });
    return bulkJson({ error: "SKU 批量更新失败，未报告成功", code: "BULK_UPDATE_FAILED", requestId }, 500, requestId);
  }

  if (!execution.ok) {
    await auditCatalogAction({ request, user: admin.user, action: "bulk_update_product_skus", module: "products", targetType: "product_sku_batch", targetId: params.id, targetLabel: result.preview.action, result: "failed", beforeSummary, afterSummary: { updated_count: execution.updated_count }, errorMessage: execution.code });
    return bulkJson({ error: "SKU 批量更新数量与预期不一致，未报告成功", code: execution.code, updated_count: execution.updated_count, requestId }, 409, requestId);
  }

  await auditCatalogAction({ request, user: admin.user, action: "bulk_update_product_skus", module: "products", targetType: "product_sku_batch", targetId: params.id, targetLabel: result.preview.action, result: "success", beforeSummary, afterSummary: { target_status: result.preview.target_status, updated_count: execution.updated_count, sku_ids: execution.rows.map((row) => row.id) } });
  if (execution.updated_count > 0) {
    try {
      await syncSkuProductSummary(service, params.id);
    } catch {
      return bulkJson({ error: "SKU 状态已完整更新，但商品汇总同步失败，请刷新并重新核验", code: "BULK_SUMMARY_SYNC_FAILED", updated_count: execution.updated_count, requestId }, 500, requestId);
    }
  }
  return bulkJson({ ok: true, action: result.preview.action, target_status: result.preview.target_status, selected_count: result.preview.selected_count, updated_count: execution.updated_count, no_change_count: result.preview.no_change_count, requestId }, 200, requestId);
}
