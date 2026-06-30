import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "crypto";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export type PublicOrderLookupResult = {
  orderNo: string;
  status: string;
  paymentStatus: string;
  deliveryStatus: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    productName: string;
    skuTitle: string | null;
    skuCode: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
};

const ORDER_LOOKUP_SELECT = `
  id,order_no,status,payment_status,total_amount,currency,created_at,updated_at,
  order_query_token_hash,order_query_token_expires_at,order_query_token_revoked_at,
  order_items(product_name,sku_title,sku_code,quantity,unit_price,line_total,delivery_status),
  order_deliveries(delivery_status)
`;

export function generateOrderQueryToken() {
  return randomBytes(24).toString("base64url");
}

export function hashOrderQueryToken(token: string) {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function verifyOrderQueryToken(inputToken: string, expectedHash: string | null | undefined) {
  if (!inputToken.trim() || !expectedHash) return false;
  const inputHash = hashOrderQueryToken(inputToken);
  const left = Buffer.from(inputHash, "hex");
  const right = Buffer.from(expectedHash, "hex");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function maskOrderLookupValue(value: string | null | undefined) {
  if (!value) return null;
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

function normalizeNumber(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function normalizeOrder(row: Record<string, any>): PublicOrderLookupResult {
  const items = Array.isArray(row.order_items) ? row.order_items : [];
  const deliveries = Array.isArray(row.order_deliveries) ? row.order_deliveries : [];
  const deliveryStatus =
    items.find((item: Record<string, unknown>) => item.delivery_status)?.delivery_status ??
    deliveries.find((item: Record<string, unknown>) => item.delivery_status)?.delivery_status ??
    "pending";

  return {
    orderNo: String(row.order_no ?? ""),
    status: String(row.status ?? ""),
    paymentStatus: String(row.payment_status ?? ""),
    deliveryStatus: String(deliveryStatus ?? "pending"),
    totalAmount: normalizeNumber(row.total_amount),
    currency: String(row.currency ?? "CNY"),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    items: items.map((item: Record<string, unknown>) => ({
      productName: String(item.product_name ?? "订单商品"),
      skuTitle: item.sku_title ? String(item.sku_title) : null,
      skuCode: item.sku_code ? String(item.sku_code) : null,
      quantity: Number(item.quantity ?? 1),
      unitPrice: normalizeNumber(item.unit_price),
      lineTotal: normalizeNumber(item.line_total),
    })),
  };
}

export async function lookupGuestOrder(orderNo: string, token: string) {
  const normalizedOrderNo = orderNo.trim();
  const normalizedToken = token.trim();
  if (!normalizedOrderNo || !normalizedToken) {
    return { ok: false as const, reason: "invalid" };
  }

  const service = getSupabaseServiceRoleClient();
  if (!service) {
    return { ok: false as const, reason: "unavailable" };
  }

  const { data, error } = await service
    .from("orders")
    .select(ORDER_LOOKUP_SELECT)
    .eq("order_no", normalizedOrderNo)
    .maybeSingle();

  if (error || !data) {
    return { ok: false as const, reason: "invalid" };
  }

  const row = data as Record<string, any>;
  const revoked = Boolean(row.order_query_token_revoked_at);
  const expired = row.order_query_token_expires_at
    ? new Date(row.order_query_token_expires_at).getTime() <= Date.now()
    : false;
  if (revoked || expired || !verifyOrderQueryToken(normalizedToken, row.order_query_token_hash)) {
    return { ok: false as const, reason: "invalid" };
  }

  return { ok: true as const, order: normalizeOrder(row) };
}
