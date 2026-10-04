import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { auditCatalogAction, requireCatalogAdmin } from "../../../../catalog/_shared";
import { inspectCatalogSkuSchema } from "@/lib/products/catalog-readiness.mjs";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

const MAX_MUTATIONS = 100;
const PAYLOAD_FIELDS = new Set(["sku_title", "sku_code", "price", "original_price", "stock", "status", "delivery_type", "image_url", "sort_order"]);
const STABLE_CODES = new Set([
  "INVALID_SKU_WORKSPACE",
  "SKU_WORKSPACE_STALE",
  "SKU_OWNERSHIP_MISMATCH",
  "SKU_CODE_CONFLICT",
  "SKU_ACTIVATION_NOT_READY",
  "SKU_BATCH_LIMIT_EXCEEDED",
  "PRODUCT_NOT_FOUND",
]);

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function errorCode(error: unknown) {
  const value = error as { message?: unknown; details?: unknown } | null;
  const message = String(value?.message ?? "");
  return Array.from(STABLE_CODES).find((code) => message.includes(code)) ?? "SKU_WORKSPACE_SAVE_FAILED";
}

function safeDetails(error: unknown, code: string) {
  if (code !== "SKU_ACTIVATION_NOT_READY") return undefined;
  const raw = String((error as { details?: unknown } | null)?.details ?? "");
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    return parsed.map((item) => ({
      sku_id: typeof item?.sku_id === "string" ? item.sku_id : null,
      sku_code: typeof item?.sku_code === "string" ? item.sku_code : null,
      reasons: Array.isArray(item?.reasons) ? item.reasons.filter((reason: unknown) => typeof reason === "string") : [],
    }));
  } catch {
    return undefined;
  }
}

function statusFor(code: string) {
  if (code === "PRODUCT_NOT_FOUND") return 404;
  if (code === "INVALID_SKU_WORKSPACE" || code === "SKU_BATCH_LIMIT_EXCEEDED") return 400;
  if (["SKU_WORKSPACE_STALE", "SKU_OWNERSHIP_MISMATCH", "SKU_CODE_CONFLICT", "SKU_ACTIVATION_NOT_READY"].includes(code)) return 409;
  return 500;
}

function messageFor(code: string) {
  if (code === "SKU_WORKSPACE_STALE") return "SKU 已被其他操作修改，请刷新后重新确认";
  if (code === "SKU_ACTIVATION_NOT_READY") return "SKU 激活条件未满足，请处理 readiness 问题后重试";
  if (code === "SKU_CODE_CONFLICT") return "SKU Code 已存在或本次修改产生冲突";
  if (code === "SKU_OWNERSHIP_MISMATCH") return "SKU 不属于当前商品，请刷新后重试";
  if (code === "SKU_BATCH_LIMIT_EXCEEDED") return `一次最多保存 ${MAX_MUTATIONS} 个 SKU`;
  if (code === "PRODUCT_NOT_FOUND") return "商品不存在";
  if (code === "INVALID_SKU_WORKSPACE") return "SKU workspace 参数无效";
  return "SKU workspace 保存失败";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validOperationEnvelope(value: unknown) {
  if (!isRecord(value) || !isRecord(value.payload)) return false;
  if (Object.keys(value.payload).length !== PAYLOAD_FIELDS.size
      || Object.keys(value.payload).some((key) => !PAYLOAD_FIELDS.has(key))) return false;
  if (value.type === "create") {
    return typeof value.client_id === "string"
      && Object.keys(value).length === 3
      && Object.keys(value).every((key) => ["type", "client_id", "payload"].includes(key));
  }
  if (value.type === "update") {
    return typeof value.sku_id === "string"
      && typeof value.expected_updated_at === "string"
      && Object.keys(value).length === 4
      && Object.keys(value).every((key) => ["type", "sku_id", "expected_updated_at", "payload"].includes(key));
  }
  return false;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const requestId = randomUUID();
  const admin = await requireCatalogAdmin(requestId);
  if (!admin.ok) return admin.response;
  const service = getSupabaseServiceRoleClient();
  if (!service) return json({ error: "SKU 保存权限不可用", code: "SKU_WORKSPACE_SAVE_UNAVAILABLE", requestId }, 503);
  const schemaReadiness = await inspectCatalogSkuSchema(service);
  if (!schemaReadiness.ready) {
    return json({ error: "SKU schema 尚未就绪，写入已安全阻止", code: "CATALOG_SKU_SCHEMA_NOT_READY", diagnostics: schemaReadiness, requestId }, 503);
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || Array.isArray(body) || Object.keys(body).some((key) => key !== "operations")
      || !Array.isArray(body.operations) || body.operations.length === 0
      || body.operations.some((operation) => !validOperationEnvelope(operation))) {
    return json({ error: "SKU workspace 参数无效", code: "INVALID_SKU_WORKSPACE", requestId }, 400);
  }
  if (body.operations.length > MAX_MUTATIONS) {
    return json({ error: `一次最多保存 ${MAX_MUTATIONS} 个 SKU`, code: "SKU_BATCH_LIMIT_EXCEEDED", requestId }, 400);
  }

  const { data, error } = await service.rpc("admin_save_product_sku_workspace", {
    p_product_id: params.id,
    p_operations: body.operations,
  });
  if (error || !data || typeof data !== "object") {
    const code = errorCode(error);
    const details = safeDetails(error, code);
    await auditCatalogAction({
      request,
      user: admin.user,
      action: "save_product_sku_workspace",
      module: "products",
      targetType: "product_sku_workspace",
      targetId: params.id,
      result: "failed",
      afterSummary: { operation_count: body.operations.length, code },
      errorMessage: code,
    });
    return json({ error: messageFor(code), code, ...(details ? { blocked_items: details } : {}), requestId }, statusFor(code));
  }

  const result = data as Record<string, unknown>;
  await auditCatalogAction({
    request,
    user: admin.user,
    action: "save_product_sku_workspace",
    module: "products",
    targetType: "product_sku_workspace",
    targetId: params.id,
    result: "success",
    afterSummary: {
      created_count: Number(result.created_count ?? 0),
      updated_count: Number(result.updated_count ?? 0),
      no_change_count: Number(result.no_change_count ?? 0),
    },
  });
  return json({ ...result, requestId });
}
