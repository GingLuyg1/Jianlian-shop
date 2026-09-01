import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { createDajuClient } from "@/lib/providers/daju/client";
import { getSafeDajuError } from "@/lib/providers/daju/errors";
import { compareDajuDecimal, parseDajuProductBinding, validateDajuBindingAgainstProductDetail } from "@/lib/providers/daju/mapper.mjs";
import type { DajuProductDetail } from "@/lib/providers/daju/types";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

type Context = { params: { productId: string } };

function json(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: Request, context: Context) {
  const requestId = randomUUID();
  const admin = await getServerAdminContext();
  if (!admin.ok) return json({ error: admin.message, code: "DAJU_ADMIN_REQUIRED", requestId }, admin.status);
  const service = getSupabaseServiceRoleClient();
  if (!service) return json({ error: "服务端商品配置权限不可用", code: "SERVICE_ROLE_UNAVAILABLE", requestId }, 503);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "供应商绑定参数无效", code: "DAJU_BINDING_INVALID", requestId }, 400);
  }
  const input = body as Record<string, unknown>;
  const metadata = {
    fulfillment_source: "supplier",
    supplier: "daju",
    supplier_product_id: input.supplier_product_id,
    supplier_sku: input.supplier_sku ?? null,
    supplier_inputs_mapping: input.supplier_inputs_mapping ?? {},
    supplier_max_unit_cost: input.supplier_max_unit_cost,
  };
  const parsed = parseDajuProductBinding(metadata);
  if (!parsed || parsed.maxUnitCost === null || compareDajuDecimal(parsed.maxUnitCost, "0") !== 1) {
    return json({ error: "供应商绑定或成本上限无效", code: "DAJU_BINDING_INVALID", requestId }, 400);
  }

  let supplierProduct: DajuProductDetail;
  try {
    const client = createDajuClient();
    supplierProduct = await client.getProduct(parsed.productId);
  } catch (error) {
    const safe = getSafeDajuError(error);
    console.error("[DajuAdmin] authoritative product read failed", { requestId, code: safe.code, kind: safe.kind });
    return json({ error: "供应商商品详情读取失败，未保存自动履约绑定", code: safe.code, requestId }, safe.status);
  }

  const authoritativeValidation = validateDajuBindingAgainstProductDetail(parsed, supplierProduct);
  if (!authoritativeValidation.ok) {
    if (authoritativeValidation.code === "DAJU_REQUIRED_INPUTS_UNMAPPED") {
      return json({ error: `以下供应商必填字段尚未映射：${authoritativeValidation.missing.join("、")}`, code: authoritativeValidation.code, requestId }, 400);
    }
    if (authoritativeValidation.code === "DAJU_PRODUCT_NOT_AUTOMATIC") {
      return json({ error: "该供应商商品不支持自动交付，不能绑定到自动履约商品", code: authoritativeValidation.code, requestId }, 400);
    }
    return json({ error: "供应商商品详情与绑定参数不一致", code: authoritativeValidation.code, requestId }, 409);
  }

  // The current Daju purchase contract defines supplier_sku as optional; do not infer a new SKU requirement here.

  const { data: product, error: readError } = await service
    .from("products")
    .select("id,name,metadata,delivery_type")
    .eq("id", context.params.productId)
    .maybeSingle();
  if (readError || !product) return json({ error: "网站商品不存在", code: "PRODUCT_NOT_FOUND", requestId }, 404);

  const currentMetadata = product.metadata && typeof product.metadata === "object" && !Array.isArray(product.metadata)
    ? product.metadata as Record<string, unknown>
    : {};
  const nextMetadata = { ...currentMetadata, ...metadata };
  const { data: saved, error: saveError } = await service
    .from("products")
    .update({ metadata: nextMetadata, delivery_type: "automatic" })
    .eq("id", context.params.productId)
    .select("id,name,metadata,delivery_type")
    .single();
  if (saveError || !saved) {
    console.error("[DajuAdmin] binding save failed", { requestId, code: saveError?.code ?? "UNKNOWN" });
    return json({ error: "供应商绑定保存失败", code: "DAJU_BINDING_SAVE_FAILED", requestId }, 500);
  }

  await writeAdminAuditLog({
    request,
    admin: { id: admin.user.id, email: admin.user.email },
    action: "bind_daju_supplier_product",
    module: "products",
    targetType: "product",
    targetId: context.params.productId,
    targetLabel: String(product.name ?? ""),
    result: "success",
    beforeSummary: { fulfillment_source: currentMetadata.fulfillment_source ?? null, supplier: currentMetadata.supplier ?? null },
    afterSummary: { fulfillment_source: "supplier", supplier: "daju", supplier_product_id: parsed.productId, has_sku: Boolean(parsed.sku), has_cost_limit: true },
  });
  return json({ product: saved, requestId });
}
