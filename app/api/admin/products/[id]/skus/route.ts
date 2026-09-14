import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { auditCatalogAction, requireCatalogAdmin } from "../../../catalog/_shared";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

const SKU_FIELDS = "id,product_id,sku_code,sku_title,price,original_price,stock,status,delivery_type,image_url,sort_order,metadata,created_at,updated_at";
const STATUSES = new Set(["active", "inactive", "sold_out", "draft"]);
const DELIVERY_TYPES = new Set(["manual", "automatic", "shipping"]);

function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }); }
function text(value: unknown, max = 200) { return typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null; }
function money(value: unknown, optional = false) { if (optional && (value === null || value === "" || value === undefined)) return null; const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : undefined; }
function integer(value: unknown) { const n = Number(value); return Number.isSafeInteger(n) && n >= 0 ? n : undefined; }

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const requestId = randomUUID();
  const admin = await requireCatalogAdmin(requestId);
  if (!admin.ok) return admin.response;
  const service = getSupabaseServiceRoleClient() ?? admin.supabase;
  const { data, error } = await service.from("product_skus").select(SKU_FIELDS).eq("product_id", params.id).order("sort_order").order("created_at");
  return error ? json({ error: "SKU 读取失败", requestId }, 500) : json({ skus: data ?? [], requestId });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const requestId = randomUUID();
  const admin = await requireCatalogAdmin(requestId);
  if (!admin.ok) return admin.response;
  const service = getSupabaseServiceRoleClient();
  if (!service) return json({ error: "SKU 保存权限不可用", requestId }, 503);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const title = text(body?.sku_title);
  const code = text(body?.sku_code);
  const price = money(body?.price);
  const originalPrice = money(body?.original_price, true);
  const stock = integer(body?.stock);
  const sortOrder = integer(body?.sort_order);
  const status = text(body?.status, 20);
  const deliveryType = body?.delivery_type === null || body?.delivery_type === "" || body?.delivery_type === undefined ? null : text(body.delivery_type, 40);
  if (!title || !code || price === undefined || originalPrice === undefined || stock === undefined || sortOrder === undefined || !status || !STATUSES.has(status) || (deliveryType !== null && !DELIVERY_TYPES.has(deliveryType))) return json({ error: "SKU 参数无效", requestId }, 400);
  const payload = { product_id: params.id, sku_title: title, sku_code: code, combination_key: code.toLowerCase(), price, original_price: originalPrice, stock, status, sort_order: sortOrder, delivery_type: deliveryType, image_url: text(body?.image_url, 2000), metadata: {} };
  const { data, error } = await service.from("product_skus").insert(payload).select(SKU_FIELDS).single();
  if (error || !data) return json({ error: error?.code === "23505" ? "SKU Code 已存在" : "SKU 新增失败", requestId }, error?.code === "23505" ? 409 : 500);
  await service.from("products").update({ has_skus: true }).eq("id", params.id);
  await auditCatalogAction({ request, user: admin.user, action: "create_product_sku", module: "products", targetType: "product_sku", targetId: data.id, targetLabel: title, result: "success", afterSummary: data });
  return json({ sku: data, requestId }, 201);
}
