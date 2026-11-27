import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { reconcileBitrefillOrder } from "@/lib/providers/bitrefill/live-fulfillment";
import { createKuajingZyProductionRuntime } from "@/lib/providers/kuajingzy/purchase-server";
import { checkRateLimit, readBoundedJsonBody } from "@/lib/security/rate-limit";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const activeOrders = new Set<string>();
const automaticDeliveryTypes = new Set(["automatic", "auto", "card", "account", "auto_delivery"]);
const terminalOrderStatuses = new Set(["cancelled", "expired", "failed", "refunded", "completed"]);

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function authorized(request: Request) {
  const secret = process.env.INTERNAL_DELIVERY_RECOVERY_SECRET?.trim();
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!secret || !token) return false;
  const expected = Buffer.from(secret);
  const supplied = Buffer.from(token);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function POST(request: Request) {
  if (!authorized(request)) return json({ error: "UNAUTHORIZED" }, 401);
  const rate = checkRateLimit("internal_task", "order_delivery_recovery");
  if (!rate.allowed) return rate.response!;

  const body = await readBoundedJsonBody<{ orderId?: unknown } | null>(request, 1024);
  if (!body.ok) return body.response;
  const orderId = typeof body.data?.orderId === "string" ? body.data.orderId.trim().toLowerCase() : "";
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(orderId)) {
    return json({ error: "INVALID_ORDER_ID" }, 400);
  }

  const service = getSupabaseServiceRoleClient();
  if (!service) return json({ error: "SERVICE_UNAVAILABLE" }, 503);
  if (activeOrders.has(orderId)) return json({ status: "already_running" }, 409);

  activeOrders.add(orderId);
  try {
    const order = await service.from("orders")
      .select("status,payment_status,delivery_type,paid_at")
      .eq("id", orderId)
      .maybeSingle();
    if (order.error) return json({ error: "ORDER_READ_FAILED" }, 503);
    if (!order.data || order.data.payment_status !== "paid" ||
      terminalOrderStatuses.has(order.data.status) ||
      !automaticDeliveryTypes.has(order.data.delivery_type)) {
      return json({ status: "not_eligible" }, 409);
    }
    const paidAt = Date.parse(order.data.paid_at ?? "");
    if (!Number.isFinite(paidAt) || Date.now() - paidAt < 10_000) {
      return json({ status: "not_ready" }, 409);
    }

    const kuajingzy = await createKuajingZyProductionRuntime({ service }).reconcileExistingOrder(orderId);
    const bitrefill = await reconcileBitrefillOrder(service, orderId);
    if (kuajingzy.handled + bitrefill.handled > 0) {
      return json({ status: "reconciled", fulfilled: kuajingzy.fulfilled + bitrefill.fulfilled });
    }

    const requests = await service.from("supplier_fulfillment_requests")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId);
    if (requests.error || requests.count === null) {
      return json({ error: "FULFILLMENT_STATE_UNAVAILABLE" }, 503);
    }
    if (requests.count > 0) return json({ status: "manual_review" });

    // The existing RPC locks the order and delivers reserved local inventory only.
    // Recovery must never start a purchase or call the supplier fallback.
    const local = await service.rpc("deliver_digital_order", {
      p_order_id: orderId,
      p_trigger_source: "internal_delivery_recovery",
    });
    if (local.error) return json({ status: "manual_review" });
    return json({ status: "local_delivery_checked" });
  } catch {
    return json({ error: "DELIVERY_RECOVERY_FAILED" }, 503);
  } finally {
    activeOrders.delete(orderId);
  }
}
