import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { auditCatalogAction, requireCatalogAdmin } from "../../../../catalog/_shared";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

const SKU_FIELDS = "id,product_id,sku_code,sku_title,price,original_price,stock,status,delivery_type,image_url,sort_order,metadata,created_at,updated_at";
const ALLOWED = new Set(["sku_code", "sku_title", "price", "original_price", "stock", "status", "delivery_type", "image_url", "sort_order"]);
const STATUSES = new Set(["active", "inactive", "sold_out", "draft"]);
const DELIVERY_TYPES = new Set(["manual", "automatic", "shipping"]);
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }); }
function normalizedText(value: unknown, max: number) { const result = typeof value === "string" ? value.trim() : ""; return result && result.length <= max ? result : null; }

export async function PATCH(request: Request, { params }: { params: { id: string; skuId: string } }) {
  const requestId = randomUUID();
  const admin = await requireCatalogAdmin(requestId);
  if (!admin.ok) return admin.response;
  const service = getSupabaseServiceRoleClient();
  if (!service) return json({ error: "SKU 保存权限不可用", requestId }, 503);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json({ error: "SKU 参数无效", requestId }, 400);
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) if (ALLOWED.has(key)) payload[key] = value === "" && ["original_price", "image_url", "delivery_type"].includes(key) ? null : value;
  if (Object.keys(payload).length === 0) return json({ error: "没有可更新的 SKU 字段", requestId }, 400);
  if (payload.sku_code !== undefined) { const code = normalizedText(payload.sku_code, 200); if (!code) return json({ error: "SKU Code 必填且不能超过 200 个字符", requestId }, 400); payload.sku_code = code; payload.combination_key = code.toLowerCase(); }
  if (payload.sku_title !== undefined) { const title = normalizedText(payload.sku_title, 200); if (!title) return json({ error: "SKU 名称必填且不能超过 200 个字符", requestId }, 400); payload.sku_title = title; }
  if (payload.status !== undefined && !STATUSES.has(String(payload.status))) return json({ error: "SKU 状态无效", requestId }, 400);
  if (payload.delivery_type !== undefined && payload.delivery_type !== null && !DELIVERY_TYPES.has(String(payload.delivery_type))) return json({ error: "SKU 交付方式无效", requestId }, 400);
  if (payload.image_url !== undefined && payload.image_url !== null) { const imageUrl = normalizedText(payload.image_url, 2000); if (!imageUrl) return json({ error: "SKU 图片地址无效", requestId }, 400); payload.image_url = imageUrl; }
  for (const key of ["price", "original_price"]) {
    if (payload[key] !== undefined && payload[key] !== null) { const value = Number(payload[key]); if (!Number.isFinite(value) || value < 0) return json({ error: `SKU ${key} 无效`, requestId }, 400); payload[key] = value; }
  }
  for (const key of ["stock", "sort_order"]) {
    if (payload[key] !== undefined) { const value = Number(payload[key]); if (!Number.isSafeInteger(value) || value < 0) return json({ error: `SKU ${key} 无效`, requestId }, 400); payload[key] = value; }
  }
  const { data: before } = await service.from("product_skus").select(SKU_FIELDS).eq("id", params.skuId).eq("product_id", params.id).maybeSingle();
  if (!before) return json({ error: "SKU 不存在", requestId }, 404);
  const { data, error } = await service.from("product_skus").update(payload).eq("id", params.skuId).eq("product_id", params.id).select(SKU_FIELDS).single();
  if (error || !data) return json({ error: error?.code === "23505" ? "SKU Code 已存在" : "SKU 保存失败", requestId }, error?.code === "23505" ? 409 : 500);
  await auditCatalogAction({ request, user: admin.user, action: "update_product_sku", module: "products", targetType: "product_sku", targetId: params.skuId, targetLabel: String(data.sku_title ?? ""), result: "success", beforeSummary: before, afterSummary: data });
  return json({ sku: data, requestId });
}

export async function DELETE(request: Request, { params }: { params: { id: string; skuId: string } }) {
  const requestId = randomUUID();
  const admin = await requireCatalogAdmin(requestId);
  if (!admin.ok) return admin.response;
  const service = getSupabaseServiceRoleClient();
  if (!service) return json({ error: "SKU 删除权限不可用", requestId }, 503);
  const { data: before } = await service.from("product_skus").select(SKU_FIELDS).eq("id", params.skuId).eq("product_id", params.id).maybeSingle();
  if (!before) return json({ error: "SKU 不存在", requestId }, 404);
  const { error } = await service.from("product_skus").delete().eq("id", params.skuId).eq("product_id", params.id);
  if (error) return json({ error: "SKU 删除失败，可能仍被订单引用；可改为停用", requestId }, 409);
  const { count } = await service.from("product_skus").select("id", { count: "exact", head: true }).eq("product_id", params.id);
  if (!count) await service.from("products").update({ has_skus: false }).eq("id", params.id);
  await auditCatalogAction({ request, user: admin.user, action: "delete_product_sku", module: "products", targetType: "product_sku", targetId: params.skuId, targetLabel: String(before.sku_title ?? ""), result: "success", beforeSummary: before });
  return json({ ok: true, requestId });
}
