import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { syncProductDeliveryModeFromSkus } from "@/lib/products/sku-summary";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ productId: string }> };

function json(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

const DECIMAL_4_REGEX = /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,4})?$/;
const SAFE_ID_REGEX = /^[A-Za-z0-9_-]{1,120}$/;
const SAFE_SKU_REGEX = /^[A-Za-z0-9_-]{1,80}$/;

export async function POST(request: Request, context: Context) {
  const { productId } = await context.params;
  const requestId = randomUUID();
  const admin = await getServerAdminContext();
  if (!admin.ok) return json({ error: admin.message, code: "KUAJINGZY_ADMIN_REQUIRED", requestId }, admin.status);
  const service = getSupabaseServiceRoleClient();
  if (!service) return json({ error: "服务端商品配置权限不可用", code: "SERVICE_ROLE_UNAVAILABLE", requestId }, 503);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "跨境资源网绑定参数无效", code: "KUAJINGZY_BINDING_INVALID", requestId }, 400);
  }
  const input = body as Record<string, unknown>;
  const websiteSkuId = typeof input.website_sku_id === "string" && input.website_sku_id.trim() ? input.website_sku_id.trim() : null;
  const supplierProductId = typeof input.supplier_product_id === "string" ? input.supplier_product_id.trim() : "";
  const rawSupplierSku = input.supplier_sku == null || String(input.supplier_sku).trim() === "" ? null : String(input.supplier_sku).trim();
  const maxUnitCost = typeof input.supplier_max_unit_cost === "string" || typeof input.supplier_max_unit_cost === "number"
    ? String(input.supplier_max_unit_cost).trim()
    : "";
  const minUnitProfit = typeof input.supplier_min_unit_profit === "string" || typeof input.supplier_min_unit_profit === "number"
    ? String(input.supplier_min_unit_profit).trim()
    : "0.50";
  const minMarginBps = Number(input.supplier_min_margin_bps ?? 3000);
  const supplierCost = typeof input.supplier_cost === "string" || typeof input.supplier_cost === "number"
    ? String(input.supplier_cost).trim()
    : null;
  const autoPurchaseEnabled = Boolean(input.supplier_auto_purchase_enabled === true);

  if (!SAFE_ID_REGEX.test(supplierProductId)) {
    return json({ error: "跨境资源网商品 ID 格式无效", code: "KUAJINGZY_PRODUCT_ID_INVALID", requestId }, 400);
  }
  if (rawSupplierSku !== null && !SAFE_SKU_REGEX.test(rawSupplierSku)) {
    return json({ error: "跨境资源网规格 SKU 编码格式无效", code: "KUAJINGZY_SKU_INVALID", requestId }, 400);
  }
  if (!DECIMAL_4_REGEX.test(maxUnitCost) || Number(maxUnitCost) <= 0) {
    return json({ error: "请填写有效的正数最高成本上限（最多 4 位小数）", code: "KUAJINGZY_MAX_COST_INVALID", requestId }, 400);
  }
  if (!DECIMAL_4_REGEX.test(minUnitProfit) || Number(minUnitProfit) <= 0) {
    return json({ error: "请填写有效的正数最低单件利润（最多 4 位小数）", code: "KUAJINGZY_MIN_PROFIT_INVALID", requestId }, 400);
  }
  if (!Number.isSafeInteger(minMarginBps) || minMarginBps < 0 || minMarginBps > 9999) {
    return json({ error: "最低毛利率基点（bps）必须为 0 ~ 9999 的整数", code: "KUAJINGZY_MARGIN_BPS_INVALID", requestId }, 400);
  }

  const { data: product, error: readError } = await service
    .from("products")
    .select("id,name,metadata,delivery_type")
    .eq("id", productId)
    .maybeSingle();
  if (readError || !product) return json({ error: "网站商品不存在", code: "PRODUCT_NOT_FOUND", requestId }, 404);

  const bindingPatch: Record<string, unknown> = {
    fulfillment_source: "supplier",
    supplier: "kuajingzy",
    supplier_product_id: supplierProductId,
    supplier_sku: rawSupplierSku,
    supplier_currency: "CNY",
    ...(supplierCost ? { supplier_cost: supplierCost, supplier_cost_currency: "CNY" } : {}),
    supplier_max_unit_cost: maxUnitCost,
    supplier_min_unit_profit: minUnitProfit,
    supplier_min_margin_bps: minMarginBps,
    supplier_binding_status: "configured",
    supplier_auto_purchase_enabled: autoPurchaseEnabled,
  };

  const currentMetadata = product.metadata && typeof product.metadata === "object" && !Array.isArray(product.metadata)
    ? (product.metadata as Record<string, unknown>)
    : {};

  let savedProduct: Record<string, unknown> | null = null;
  let savedSku: Record<string, unknown> | null = null;

  if (websiteSkuId) {
    const { data: sku, error: skuErr } = await service
      .from("product_skus")
      .select("id,product_id,metadata")
      .eq("id", websiteSkuId)
      .eq("product_id", productId)
      .maybeSingle();
    if (skuErr || !sku) {
      return json({ error: "网站 SKU 不存在或不属于当前商品", code: "WEBSITE_SKU_NOT_FOUND", requestId }, 404);
    }
    const skuMeta = sku.metadata && typeof sku.metadata === "object" && !Array.isArray(sku.metadata)
      ? (sku.metadata as Record<string, unknown>)
      : {};
    const nextSkuMeta = { ...skuMeta, ...bindingPatch };
    const skuUpdate = await service
      .from("product_skus")
      .update({ metadata: nextSkuMeta, delivery_type: "automatic" })
      .eq("id", websiteSkuId)
      .eq("product_id", productId)
      .select("id,product_id,sku_code,sku_title,price,original_price,stock,status,delivery_type,image_url,sort_order,metadata,updated_at")
      .single();
    if (skuUpdate.error || !skuUpdate.data) {
      return json({ error: "SKU 绑定保存失败", code: "KUAJINGZY_SKU_SAVE_FAILED", requestId }, 500);
    }
    savedSku = skuUpdate.data as Record<string, unknown>;
    await syncProductDeliveryModeFromSkus(service, productId).catch(() => null);
    const refreshedProd = await service
      .from("products")
      .select("id,name,stock,metadata,delivery_type")
      .eq("id", productId)
      .maybeSingle();
    savedProduct = (refreshedProd.data as Record<string, unknown>) ?? (product as Record<string, unknown>);
  } else {
    const nextProductMeta = { ...currentMetadata, ...bindingPatch };
    const prodUpdate = await service
      .from("products")
      .update({ metadata: nextProductMeta, delivery_type: "automatic" })
      .eq("id", productId)
      .select("id,name,stock,metadata,delivery_type")
      .single();

    if (prodUpdate.error || !prodUpdate.data) {
      return json({ error: "商品绑定保存失败", code: "KUAJINGZY_PRODUCT_SAVE_FAILED", requestId }, 500);
    }
    savedProduct = prodUpdate.data as Record<string, unknown>;
  }

  await writeAdminAuditLog({
    request,
    admin: { id: admin.user.id, email: admin.user.email },
    action: "bind_kuajingzy_supplier_product",
    module: "products",
    targetType: websiteSkuId ? "product_sku" : "product",
    targetId: websiteSkuId ?? productId,
    targetLabel: String(product.name ?? ""),
    result: "success",
    beforeSummary: { fulfillment_source: currentMetadata.fulfillment_source ?? null, supplier: currentMetadata.supplier ?? null },
    afterSummary: {
      fulfillment_source: "supplier",
      supplier: "kuajingzy",
      supplier_product_id: supplierProductId,
      supplier_sku: rawSupplierSku,
      supplier_max_unit_cost: maxUnitCost,
    },
  });

  return json({ product: savedProduct, sku: savedSku, requestId });
}

export async function DELETE(request: Request, context: Context) {
  const { productId } = await context.params;
  const requestId = randomUUID();
  const admin = await getServerAdminContext();
  if (!admin.ok) return json({ error: admin.message, code: "KUAJINGZY_ADMIN_REQUIRED", requestId }, admin.status);
  const service = getSupabaseServiceRoleClient();
  if (!service) return json({ error: "服务端商品配置权限不可用", code: "SERVICE_ROLE_UNAVAILABLE", requestId }, 503);

  const url = new URL(request.url);
  const websiteSkuId = url.searchParams.get("website_sku_id")?.trim() || null;

  const { data: product, error: readError } = await service
    .from("products")
    .select("id,name,metadata")
    .eq("id", productId)
    .maybeSingle();
  if (readError || !product) return json({ error: "网站商品不存在", code: "PRODUCT_NOT_FOUND", requestId }, 404);

  const KUAJINGZY_KEYS = [
    "fulfillment_source",
    "supplier",
    "supplier_product_id",
    "supplier_sku",
    "supplier_currency",
    "supplier_cost",
    "supplier_cost_currency",
    "supplier_max_unit_cost",
    "supplier_min_unit_profit",
    "supplier_min_margin_bps",
    "supplier_binding_status",
    "supplier_auto_purchase_enabled",
    "supplier_binding_candidate",
  ];

  let savedSku: Record<string, unknown> | null = null;
  let savedProduct: Record<string, unknown> | null = null;
  if (websiteSkuId) {
    const { data: sku, error: skuErr } = await service
      .from("product_skus")
      .select("id,metadata")
      .eq("id", websiteSkuId)
      .eq("product_id", productId)
      .maybeSingle();
    if (skuErr || !sku) {
      return json({ error: "网站 SKU 不存在或不属于当前商品", code: "WEBSITE_SKU_NOT_FOUND", requestId }, 404);
    }
    const nextSkuMeta = { ...(sku.metadata && typeof sku.metadata === "object" ? (sku.metadata as Record<string, unknown>) : {}) };
    for (const k of KUAJINGZY_KEYS) delete nextSkuMeta[k];
    const skuUpdate = await service
      .from("product_skus")
      .update({ metadata: nextSkuMeta, delivery_type: "manual" })
      .eq("id", websiteSkuId)
      .eq("product_id", productId)
      .select("id,product_id,sku_code,sku_title,price,original_price,stock,status,delivery_type,image_url,sort_order,metadata,updated_at")
      .single();
    if (skuUpdate.error || !skuUpdate.data) {
      return json({ error: "解除 SKU 绑定失败", code: "KUAJINGZY_SKU_UNBIND_FAILED", requestId }, 500);
    }
    savedSku = skuUpdate.data as Record<string, unknown>;
    await syncProductDeliveryModeFromSkus(service, productId).catch(() => null);
    const refreshedProd = await service
      .from("products")
      .select("id,name,stock,metadata,delivery_type")
      .eq("id", productId)
      .maybeSingle();
    savedProduct = (refreshedProd.data as Record<string, unknown>) ?? null;
  } else {
    const nextProdMeta = { ...(product.metadata && typeof product.metadata === "object" ? (product.metadata as Record<string, unknown>) : {}) };
    for (const k of KUAJINGZY_KEYS) delete nextProdMeta[k];
    const prodUpdate = await service
      .from("products")
      .update({ metadata: nextProdMeta, delivery_type: "manual" })
      .eq("id", productId)
      .select("id,name,stock,metadata,delivery_type")
      .single();
    if (prodUpdate.error || !prodUpdate.data) {
      return json({ error: "解除商品绑定失败", code: "KUAJINGZY_PRODUCT_UNBIND_FAILED", requestId }, 500);
    }
    savedProduct = prodUpdate.data as Record<string, unknown>;
  }

  await writeAdminAuditLog({
    request,
    admin: { id: admin.user.id, email: admin.user.email },
    action: "unbind_kuajingzy_supplier_product",
    module: "products",
    targetType: websiteSkuId ? "product_sku" : "product",
    targetId: websiteSkuId ?? productId,
    targetLabel: String(product.name ?? ""),
    result: "success",
    afterSummary: { website_sku_id: websiteSkuId, supplier: "kuajingzy", unbound: true },
  });

  return json({ product: savedProduct, sku: savedSku, requestId });
}
