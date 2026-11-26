import "server-only";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { PublicOrderDeliveryItem } from "./order-query-service";

/**
 * Loads delivered digital credentials ONLY after `lookupGuestOrder(orderNo, token)`
 * has verified a valid, unexpired, unrevoked cryptographic query token for a paid order.
 * Kept isolated from `order-query-service.ts` so email-only lookups can never touch credentials.
 */
export async function loadVerifiedTokenDeliveries(
  orderNo: string
): Promise<PublicOrderDeliveryItem[]> {
  const service = getSupabaseServiceRoleClient();
  if (!service) return [];

  const { data: order } = await service
    .from("orders")
    .select("id,payment_status")
    .eq("order_no", orderNo.trim())
    .maybeSingle();

  if (!order || order.payment_status !== "paid") return [];

  const { data: rows } = await service
    .from("order_deliveries")
    .select("id,order_item_id,delivery_type,delivery_status,delivery_content,delivery_note,delivered_at")
    .eq("order_id", order.id)
    .eq("delivery_status", "delivered")
    .order("delivered_at", { ascending: true });

  return ((rows ?? []) as Array<Record<string, unknown>>)
    .filter((d) => Boolean(d.delivery_content))
    .map((d) => ({
      id: String(d.id ?? ""),
      orderItemId: d.order_item_id ? String(d.order_item_id) : null,
      deliveryType: d.delivery_type ? String(d.delivery_type) : null,
      deliveryStatus: String(d.delivery_status ?? "delivered"),
      content: d.delivery_content ? String(d.delivery_content) : null,
      deliveryNote: d.delivery_note ? String(d.delivery_note) : null,
      deliveredAt: d.delivered_at ? String(d.delivered_at) : null,
    }));
}
