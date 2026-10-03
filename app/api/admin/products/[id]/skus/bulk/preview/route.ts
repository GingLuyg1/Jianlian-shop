import { randomUUID } from "crypto";

import { requireCatalogAdmin } from "../../../../../catalog/_shared";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { inspectCatalogSkuSchema } from "@/lib/products/catalog-readiness.mjs";
import { bulkJson, readSkuBulkOperation } from "../_shared";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const requestId = randomUUID();
  const admin = await requireCatalogAdmin(requestId);
  if (!admin.ok) return admin.response;
  const service = getSupabaseServiceRoleClient();
  if (!service) return bulkJson({ error: "SKU 批量预检权限不可用", code: "SERVICE_ROLE_UNAVAILABLE", requestId }, 503, requestId);

  const schemaReadiness = await inspectCatalogSkuSchema(service);
  if (!schemaReadiness.ready) {
    return bulkJson({ error: "SKU schema 尚未就绪，批量操作已安全阻止", code: "CATALOG_SKU_SCHEMA_NOT_READY", requestId }, 503, requestId);
  }

  const body = await request.json().catch(() => null);
  const result = await readSkuBulkOperation(service, params.id, body);
  if (!result.ok) return bulkJson({ error: result.message, code: result.code, requestId }, result.status, requestId);
  return bulkJson({ preview: result.preview, requestId }, 200, requestId);
}
