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
  expected_updated_at?: string | null;
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
    if (invProdId && invProdId !== params.id) {
      return json(
        { error: "数字库存仅允许绑定当前商品，禁止跨商品绑定库存池", code: "CROSS_PRODUCT_INVENTORY_FORBIDDEN", requestId },
        400
      );
    }
    const invProdName =
      "digital_inventory_product_name" in item
        ? typeof item.digital_inventory_product_name === "string" && item.digital_inventory_product_name.trim()
          ? item.digital_inventory_product_name.trim().slice(0, 200)
          : null
        : undefined;
    const expectedUpdatedAt =
      "expected_updated_at" in item && typeof item.expected_updated_at === "string" && item.expected_updated_at.trim()
        ? item.expected_updated_at.trim()
        : null;

    updates.push({
      sku_id: skuId,
      ...(costPrice !== undefined ? { cost_price: costPrice } : {}),
      ...(deliveryMode !== undefined ? { delivery_mode: deliveryMode } : {}),
      ...(invProdId !== undefined ? { digital_inventory_product_id: invProdId } : {}),
      ...(invProdName !== undefined ? { digital_inventory_product_name: invProdName } : {}),
      ...(expectedUpdatedAt ? { expected_updated_at: expectedUpdatedAt } : {}),
    });
  }

  const skuIds = Array.from(new Set(updates.map((u) => u.sku_id)));
  const [{ data: existingRows, error: readError }, { count: totalProductSkuCount }] = await Promise.all([
    service
      .from("product_skus")
      .select("id,product_id,metadata,updated_at")
      .eq("product_id", params.id)
      .in("id", skuIds),
    service
      .from("product_skus")
      .select("id", { count: "exact", head: true })
      .eq("product_id", params.id),
  ]);

  if (readError) {
    return json({ error: "读取现有 SKU 元数据失败", requestId }, 500);
  }

  const isSingleSkuProduct = (totalProductSkuCount ?? 0) <= 1;
  const existingMap = new Map(
    ((existingRows ?? []) as Array<{ id: string; metadata?: Record<string, unknown> | null; updated_at?: string | null }>).map((row) => [
      row.id,
      {
        metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {},
        updated_at: row.updated_at ? String(row.updated_at) : null,
      },
    ])
  );

  // Validate optimistic lock up front before mutating any row
  for (const patch of updates) {
    const existing = existingMap.get(patch.sku_id);
    if (!existing) {
      return json({ error: "目标商品规格不存在或已被删除", code: "SKU_NOT_FOUND", requestId }, 404);
    }
    if (patch.expected_updated_at && existing.updated_at && patch.expected_updated_at !== existing.updated_at) {
      return json(
        { error: "商品规格已被其他操作修改，请刷新后重试", code: "SKU_WORKSPACE_STALE", requestId },
        409
      );
    }
  }

  const updatedSkus: Array<{
    id: string;
    metadata: Record<string, unknown>;
    updated_at: string | null;
    local_available_count?: number;
  }> = [];
  const failedUpdates: Array<{ sku_id: string; reason: string; code: string }> = [];

  await Promise.all(
    updates.map(async (patch) => {
      const existing = existingMap.get(patch.sku_id);
      if (!existing) {
        failedUpdates.push({ sku_id: patch.sku_id, reason: "规格不存在", code: "SKU_NOT_FOUND" });
        return;
      }
      let nextMeta: Record<string, unknown> = { ...existing.metadata };

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

      let updateQuery = service
        .from("product_skus")
        .update({ metadata: nextMeta })
        .eq("id", patch.sku_id)
        .eq("product_id", params.id);
      if (patch.expected_updated_at) {
        updateQuery = updateQuery.eq("updated_at", patch.expected_updated_at);
      }

      const { data: savedRow, error: updErr } = await updateQuery
        .select("id,metadata,updated_at")
        .maybeSingle();

      if (updErr) {
        failedUpdates.push({ sku_id: patch.sku_id, reason: "规格元数据更新失败", code: "SKU_METADATA_UPDATE_FAILED" });
        return;
      }
      if (!savedRow) {
        failedUpdates.push({ sku_id: patch.sku_id, reason: "规格已被其他操作修改", code: "SKU_WORKSPACE_STALE" });
        return;
      }

      let localAvailableCount: number | undefined = undefined;
      const effectiveMode =
        typeof nextMeta.delivery_mode === "string" ? nextMeta.delivery_mode : patch.delivery_mode ?? "";
      const boundInventoryProductId =
        typeof nextMeta.digital_inventory_product_id === "string"
          ? nextMeta.digital_inventory_product_id
          : patch.digital_inventory_product_id ?? "";

      if (effectiveMode === "automatic_digital_inventory" && boundInventoryProductId === params.id) {
        // Only auto-bind unallocated product-level inventory for single-SKU products;
        // multi-SKU products must never hijack the shared sku_id IS NULL pool into one SKU.
        if (isSingleSkuProduct) {
          await service
            .from("digital_inventory")
            .update({ sku_id: patch.sku_id })
            .eq("product_id", params.id)
            .is("sku_id", null)
            .eq("status", "available");
        }

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
    })
  );

  await syncProductDeliveryModeFromSkus(service, params.id).catch(() => null);

  if (failedUpdates.length > 0) {
    const hasStale = failedUpdates.some((item) => item.code === "SKU_WORKSPACE_STALE");
    return json(
      {
        ok: false,
        error: hasStale ? "商品规格已被其他操作修改，请刷新后重新确认" : "部分 SKU 成本或交付配置保存失败",
        code: hasStale ? "SKU_WORKSPACE_STALE" : "SKU_METADATA_PARTIAL_FAILURE",
        updated_count: updatedSkus.length,
        failed: failedUpdates,
        skus: updatedSkus,
        requestId,
      },
      hasStale ? 409 : 500
    );
  }

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
