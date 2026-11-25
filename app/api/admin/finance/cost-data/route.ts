import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/admin/api-auth";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { chunkArray, POSTGREST_PAGE_SIZE, selectAllPaginated } from "@/lib/supabase/paginated-select";

export const dynamic = "force-dynamic";

const DEFAULT_USD_CNY_RATE = Number(process.env.CNY_USDT_FIXED_RATE || "7.2") || 7.2;

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function extractExplicitCostCny(metadata: unknown): { costCny: number; source: string } | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const meta = metadata as Record<string, unknown>;

  const directCny =
    toFiniteNumber(meta.cost_price_cny) ??
    toFiniteNumber(meta.supplier_cost_cny) ??
    toFiniteNumber(meta.cost_price);
  if (directCny !== null && directCny > 0) {
    return { costCny: directCny, source: "metadata_cost" };
  }

  const supplierCost = toFiniteNumber(meta.supplier_cost) ?? toFiniteNumber(meta.supplier_unit_cost);
  if (supplierCost !== null && supplierCost > 0) {
    const currency = String(
      meta.supplier_cost_currency ?? meta.supplier_currency ?? "CNY"
    )
      .trim()
      .toUpperCase();
    const costCny = currency === "USD" || currency === "USDT" ? supplierCost * DEFAULT_USD_CNY_RATE : supplierCost;
    return { costCny, source: "supplier_sku_cost" };
  }

  return null;
}

export async function GET(request: Request) {
  const admin = await requireApiAdmin();
  if (!admin.ok) return admin.response;

  const service = getSupabaseServiceRoleClient() ?? admin.supabase;
  const url = new URL(request.url);
  const sinceParam = url.searchParams.get("since");
  const fallbackSince = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
  const sinceIso =
    sinceParam && !Number.isNaN(new Date(sinceParam).getTime())
      ? new Date(sinceParam).toISOString()
      : fallbackSince;

  const warnings: string[] = [];

  const [ordersRes, orderItemsRes, sfrRes] = await Promise.all([
    selectAllPaginated<{ id: string; payment_method?: string | null; payment_status?: string | null; total_amount?: number | string | null; created_at?: string | null }>(
      (from, to) =>
        service
          .from("orders")
          .select("id,payment_method,payment_status,total_amount,created_at")
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .range(from, to),
      { pageSize: POSTGREST_PAGE_SIZE, maxRows: 20000 }
    ),
    selectAllPaginated<{
      id: string;
      order_id: string;
      product_id: string | null;
      sku_id: string | null;
      product_name: string | null;
      sku_title: string | null;
      quantity: number | string | null;
      unit_price: number | string | null;
      line_total: number | string | null;
      created_at: string;
    }>(
      (from, to) =>
        service
          .from("order_items")
          .select("id,order_id,product_id,sku_id,product_name,sku_title,quantity,unit_price,line_total,created_at")
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .range(from, to),
      { pageSize: POSTGREST_PAGE_SIZE, maxRows: 20000 }
    ),
    selectAllPaginated<{
      order_item_id?: string | null;
      supplier?: string | null;
      status?: string | null;
      supplier_unit_price?: number | string | null;
      supplier_total_price?: number | string | null;
    }>(
      (from, to) =>
        service
          .from("supplier_fulfillment_requests")
          .select("id,order_id,order_item_id,supplier,status,supplier_unit_price,supplier_total_price,created_at")
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .range(from, to),
      { pageSize: POSTGREST_PAGE_SIZE, maxRows: 20000 }
    ),
  ]);

  if (ordersRes.error) warnings.push("订单支付方式读取部分失败");
  if (orderItemsRes.error) warnings.push("订单明细读取失败");
  if (sfrRes.error) warnings.push("供应商履约成本读取失败");

  const orderItems = orderItemsRes.error ? [] : orderItemsRes.rows;

  const skuIds = Array.from(new Set(orderItems.map((i) => i.sku_id).filter((v): v is string => Boolean(v))));
  const productIds = Array.from(new Set(orderItems.map((i) => i.product_id).filter((v): v is string => Boolean(v))));

  const skuChunks = chunkArray(skuIds, 200);
  const productChunks = chunkArray(productIds, 200);

  const [skuChunkResults, productChunkResults] = await Promise.all([
    Promise.all(
      skuChunks.map((ids) =>
        service.from("product_skus").select("id,product_id,price,metadata").in("id", ids)
      )
    ),
    Promise.all(
      productChunks.map((ids) =>
        service.from("products").select("id,metadata").in("id", ids)
      )
    ),
  ]);

  const orderPaymentMethodById: Record<string, string> = {};
  if (!ordersRes.error) {
    for (const row of ordersRes.rows) {
      orderPaymentMethodById[row.id] = String(row.payment_method ?? "").trim().toLowerCase();
    }
  }

  const fulfillmentCostByItemId: Record<
    string,
    { unitCostCny: number; totalCostCny: number; supplier: string; status: string }
  > = {};
  if (!sfrRes.error) {
    for (const row of sfrRes.rows) {
      if (!row.order_item_id) continue;
      const unitPrice = toFiniteNumber(row.supplier_unit_price);
      const totalPrice = toFiniteNumber(row.supplier_total_price);
      if ((totalPrice !== null && totalPrice > 0) || (unitPrice !== null && unitPrice > 0)) {
        const existing = fulfillmentCostByItemId[row.order_item_id];
        const statusUpper = String(row.status ?? "").toUpperCase();
        // Prefer FULFILLED/COMPLETED over other states if multiple rows exist
        if (!existing || statusUpper === "FULFILLED" || statusUpper === "COMPLETED") {
          fulfillmentCostByItemId[row.order_item_id] = {
            unitCostCny: unitPrice ?? totalPrice ?? 0,
            totalCostCny: totalPrice ?? unitPrice ?? 0,
            supplier: String(row.supplier ?? ""),
            status: String(row.status ?? ""),
          };
        }
      }
    }
  }

  const skuCostBySkuId: Record<string, { costCny: number; source: string }> = {};
  for (const res of skuChunkResults) {
    if (res.error) {
      warnings.push("部分 SKU 成本配置读取失败");
      continue;
    }
    for (const row of (res.data ?? []) as Array<{ id: string; metadata?: unknown }>) {
      const parsed = extractExplicitCostCny(row.metadata);
      if (parsed) skuCostBySkuId[row.id] = parsed;
    }
  }

  const productCostByProductId: Record<string, { costCny: number; source: string }> = {};
  for (const res of productChunkResults) {
    if (res.error) {
      warnings.push("部分商品成本配置读取失败");
      continue;
    }
    for (const row of (res.data ?? []) as Array<{ id: string; metadata?: unknown }>) {
      const parsed = extractExplicitCostCny(row.metadata);
      if (parsed) productCostByProductId[row.id] = parsed;
    }
  }

  return NextResponse.json({
    fulfillmentCostByItemId,
    skuCostBySkuId,
    productCostByProductId,
    orderPaymentMethodById,
    orderItems,
    warnings,
  });
}
