import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { auditCatalogAction, requireCatalogAdmin } from "../../../../catalog/_shared";
import { withDeliveryModeMetadata, type ExtendedDeliveryMode } from "@/lib/products/delivery-and-stock";
import { syncProductDeliveryModeFromSkus } from "@/lib/products/sku-summary";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const ALLOWED_DELIVERY_MODES = new Set<string>([
  "manual",
  "automatic",
  "automatic_digital_inventory",
  "shipping",
  "preorder_address",
  "preorder_email",
]);

type MetadataPatchInput = {
  sku_id: string;
  cost_price?: number | null;
  delivery_mode?: ExtendedDeliveryMode | null;
  digital_inventory_product_id?: string | null;
  digital_inventory_product_name?: string | null;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const requestId = randomUUID();
  const admin = await requireCatalogAdmin(requestId);
  if (!admin.ok) return admin.response;

  const service = getSupabaseServiceRoleClient();
  if (!service) {
    return json({ error: "SKU 元数据保存权限不可用", requestId }, 503);
  }

  const body = (await request.json().catch(() => null)) as { updates?: unknown } | null;
  if (!body || !Array.isArray(body.updates) || body.updates.length === 0 || body.updates.length > 100) {
    return json({ error: "无效的 SKU 成本/交付配置参数", requestId }, 400);
  }

  const updates: MetadataPatchInput[] = [];
  for (const raw of body.updates) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return json({ error: "SKU 配置项格式错误", requestId }, 400);
    }
    const item = raw as Record<string, unknown>;
    const skuId = typeof item.sku_id === "string" ? item.sku_id.trim() : "";
    if (!skuId) return json({ error: "缺少 sku_id", requestId }, 400);

    let costPrice: number | null | undefined = undefined;
    if ("cost_price" in item) {
      if (item.cost_price === null || item.cost_price === "") {
        costPrice = null;
      } else {
        const parsed = Number(item.cost_price);
        if (!Number.isFinite(parsed) || parsed < 0) {
          return json({ error: "SKU 成本价必须是大于等于 0 的数字", requestId }, 400);
        }
        costPrice = Number(parsed.toFixed(4));
      }
    }

    let deliveryMode: ExtendedDeliveryMode | null | undefined = undefined;
    if ("delivery_mode" in item) {
      if (item.delivery_mode === null || item.delivery_mode === "") {
        deliveryMode = null;
      } else if (typeof item.delivery_mode === "string" && ALLOWED_DELIVERY_MODES.has(item.delivery_mode)) {
        deliveryMode = item.delivery_mode as ExtendedDeliveryMode;
      } else {
        return json({ error: "无效的交付模式", requestId }, 400);
      }
    }

    const invProdId =
      "digital_inventory_product_id" in item
        ? typeof item.digital_inventory_product_id === "string" && item.digital_inventory_product_id.trim()
          ? item.digital_inventory_product_id.trim()
          : null
        : undefined;
    const invProdName =
      "digital_inventory_product_name" in item
        ? typeof item.digital_inventory_product_name === "string" && item.digital_inventory_product_name.trim()
          ? item.digital_inventory_product_name.trim().slice(0, 200)
          : null
        : undefined;

    updates.push({
      sku_id: skuId,
      ...(costPrice !== undefined ? { cost_price: costPrice } : {}),
      ...(deliveryMode !== undefined ? { delivery_mode: deliveryMode } : {}),
      ...(invProdId !== undefined ? { digital_inventory_product_id: invProdId } : {}),
      ...(invProdName !== undefined ? { digital_inventory_product_name: invProdName } : {}),
    });
  }

  const skuIds = Array.from(new Set(updates.map((u) => u.sku_id)));
  const { data: existingRows, error: readError } = await service
    .from("product_skus")
    .select("id,product_id,metadata")
    .eq("product_id", params.id)
    .in("id", skuIds);

  if (readError) {
    return json({ error: "读取现有 SKU 元数据失败", requestId }, 500);
  }

  const existingMap = new Map(
    ((existingRows ?? []) as Array<{ id: string; metadata?: Record<string, unknown> | null }>).map((row) => [
      row.id,
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {},
    ])
  );

  const updatedSkus: Array<{
    id: string;
    metadata: Record<string, unknown>;
    updated_at: string | null;
    local_available_count?: number;
  }> = [];

  await Promise.all(
    updates.map(async (patch) => {
      const currentMeta = existingMap.get(patch.sku_id);
      if (!currentMeta) return;
      let nextMeta: Record<string, unknown> = { ...currentMeta };

      if ("delivery_mode" in patch) {
        nextMeta = withDeliveryModeMetadata(nextMeta, patch.delivery_mode ?? "");
        if (patch.delivery_mode === "automatic_digital_inventory") {
          nextMeta.fulfillment_source = "local_inventory";
        } else if (patch.delivery_mode === "automatic" && nextMeta.supplier) {
          nextMeta.fulfillment_source = "supplier";
        }
      }

      if ("cost_price" in patch) {
        if (patch.cost_price === null) {
          delete nextMeta.cost_price;
        } else {
          nextMeta.cost_price = patch.cost_price;
        }
      }

      if ("digital_inventory_product_id" in patch) {
        if (patch.digital_inventory_product_id === null) {
          delete nextMeta.digital_inventory_product_id;
          delete nextMeta.digital_inventory_product_name;
        } else {
          nextMeta.digital_inventory_product_id = patch.digital_inventory_product_id;
          if (patch.digital_inventory_product_name) {
            nextMeta.digital_inventory_product_name = patch.digital_inventory_product_name;
          }
        }
      }

      const { data: savedRow, error: updErr } = await service
        .from("product_skus")
        .update({ metadata: nextMeta })
        .eq("id", patch.sku_id)
        .eq("product_id", params.id)
        .select("id,metadata,updated_at")
        .single();

      if (!updErr && savedRow) {
        let localAvailableCount: number | undefined = undefined;
        const effectiveMode =
          typeof nextMeta.delivery_mode === "string" ? nextMeta.delivery_mode : patch.delivery_mode ?? "";
        const boundInventoryProductId =
          typeof nextMeta.digital_inventory_product_id === "string"
            ? nextMeta.digital_inventory_product_id
            : patch.digital_inventory_product_id ?? "";

        if (effectiveMode === "automatic_digital_inventory" && boundInventoryProductId === params.id) {
          // Bind product-level unallocated available digital_inventory rows to this SKU
          // so both activation readiness checks and deliver_digital_order match sku_id cleanly.
          await service
            .from("digital_inventory")
            .update({ sku_id: patch.sku_id })
            .eq("product_id", params.id)
            .is("sku_id", null)
            .eq("status", "available");

          const { count: availCount } = await service
            .from("digital_inventory")
            .select("id", { count: "exact", head: true })
            .eq("product_id", params.id)
            .eq("sku_id", patch.sku_id)
            .eq("status", "available");

          if (typeof availCount === "number" && Number.isFinite(availCount)) {
            localAvailableCount = availCount;
          }
        }

        updatedSkus.push({
          id: String(savedRow.id),
          metadata: (savedRow.metadata as Record<string, unknown>) ?? nextMeta,
          updated_at: savedRow.updated_at ? String(savedRow.updated_at) : null,
          ...(localAvailableCount !== undefined ? { local_available_count: localAvailableCount } : {}),
        });
      }
    })
  );

  await syncProductDeliveryModeFromSkus(service, params.id).catch(() => null);

  await auditCatalogAction({
    request,
    user: admin.user,
    action: "update_product_sku_metadata",
    module: "products",
    targetType: "product_sku_metadata",
    targetId: params.id,
    result: "success",
    afterSummary: { updated_count: updatedSkus.length },
  });

  return json({ ok: true, updated_count: updatedSkus.length, skus: updatedSkus, requestId });
}
