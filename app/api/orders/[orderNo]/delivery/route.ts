import { NextResponse } from "next/server";
import { deliverDigitalOrder } from "@/lib/delivery/delivery-service";
import { getOrderErrorMessage } from "@/lib/orders/order-queries";
import { createKuajingZyProductionRuntime } from "@/lib/providers/kuajingzy/purchase-server";
import { reconcileBitrefillOrder } from "@/lib/providers/bitrefill/live-fulfillment";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { checkRateLimit, getUserRateLimitKey } from "@/lib/security/rate-limit";
import { assertUserBusinessAllowed, isAccountRestrictionError } from "@/lib/users/account-guard";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    orderNo: string;
  }>;
};

type DeliveryRow = {
  order_no: string;
  order_status: string;
  payment_status: string;
  product_name: string | null;
  delivery_id: string | null;
  delivery_status: string | null;
  delivery_type: string | null;
  delivered_at: string | null;
  viewed_at: string | null;
  masked_content: string | null;
  content: string | null;
  delivery_note: string | null;
};

function json(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function getDeliveryErrorCode(error: unknown) {
  return typeof (error as { code?: unknown } | null)?.code === "string"
    ? String((error as { code: string }).code)
    : "UNKNOWN";
}

function classifyDeliveryError(error: unknown) {
  const message = getOrderErrorMessage(error, "交付内容读取失败");
  const normalized = message.toLowerCase();
  if (normalized.includes("please sign in")) {
    return { status: 401, message: "请先登录" };
  }
  if (normalized.includes("not paid") || message.includes("未支付")) {
    return { status: 403, message: "订单未支付，不能查看交付内容" };
  }
  if (normalized.includes("does not allow delivery access")) {
    return { status: 403, message: "当前订单状态不允许查看交付内容" };
  }
  if (
    normalized.includes("access denied") ||
    normalized.includes("not found") ||
    message.includes("无权") ||
    message.includes("不存在")
  ) {
    return { status: 404, message: "订单不存在或无权查看" };
  }
  return { status: 500, message: "交付信息加载失败，请稍后重试" };
}

function logDeliveryDatabaseError(requestId: string, error: unknown) {
  console.error("[Orders] delivery RPC failed", {
    requestId,
    code: getDeliveryErrorCode(error),
    message: getOrderErrorMessage(error, "Unknown delivery database error"),
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const requestId = crypto.randomUUID();
  try {
    if (!hasSupabaseServerConfig()) {
      return json({ error: "Supabase 环境变量未配置" }, { status: 500 });
    }

    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return json({ error: "请先登录" }, { status: 401 });
    }

    const deliveryRate = checkRateLimit("payment_status_query", getUserRateLimitKey(user.id, "order_delivery"));
    if (!deliveryRate.allowed) {
      return deliveryRate.response!;
    }

    try {
      await assertUserBusinessAllowed(supabase, user.id, "view_delivery");
    } catch (guardError) {
      if (isAccountRestrictionError(guardError)) {
        return json({ error: guardError.message, code: guardError.code }, { status: guardError.status });
      }
      throw guardError;
    }

    const { orderNo } = await context.params;
    const { data, error } = await supabase.rpc("get_order_delivery_for_user", {
      p_order_no: orderNo,
    });

    if (error) {
      logDeliveryDatabaseError(requestId, error);
      const classified = classifyDeliveryError(error);
      return json({ error: classified.message, request_id: requestId }, { status: classified.status });
    }

    let rows = (data ?? []) as DeliveryRow[];
    let needsManualSupport = false;
    let manualSupportMessage = "";
    if (rows.length === 0) {
      // Best-effort reconciliation + idempotent compensation for paid orders
      // whose delivery did not complete synchronously during payment callback.
      try {
        const service = getSupabaseServiceRoleClient();
        if (service) {
          const { data: paidOrder } = await service
            .from("orders")
            .select("id,status,fulfillment_status,delivery_type,paid_at,created_at")
            .eq("order_no", orderNo)
            .eq("user_id", user.id)
            .eq("payment_status", "paid")
            .maybeSingle();
          if (paidOrder?.id) {
            const orderId = String(paidOrder.id);
            const kSummary = await createKuajingZyProductionRuntime({ service }).reconcileExistingOrder(orderId);
            const bSummary = kSummary.fulfilled > 0
              ? { fulfilled: 0 }
              : await reconcileBitrefillOrder(service, orderId);

            let compensated = false;
            const autoDeliveryTypes = new Set(["automatic", "auto", "card", "account", "auto_delivery"]);
            const paidAtMs = Date.parse(String(paidOrder.paid_at ?? paidOrder.created_at ?? ""));
            const ageMs = Number.isFinite(paidAtMs) ? Date.now() - paidAtMs : 0;

            if (
              kSummary.fulfilled === 0 &&
              bSummary.fulfilled === 0 &&
              kSummary.handled === 0 &&
              autoDeliveryTypes.has(String(paidOrder.delivery_type ?? "").toLowerCase()) &&
              ageMs >= 10_000
            ) {
              // Check that no supplier request/attempt already exists before triggering
              // one atomic, DB-locked idempotent compensation delivery.
              const { count: existingReqCount } = await service
                .from("supplier_fulfillment_requests")
                .select("id", { count: "exact", head: true })
                .eq("order_id", orderId);
              if ((existingReqCount ?? 0) === 0) {
                try {
                  const compResult = await deliverDigitalOrder(service, orderId, "delivery_compensation");
                  if ((compResult.delivered_count ?? 0) > 0) compensated = true;
                } catch {
                  // Compensation failure is surfaced below via manual_review check.
                }
              }
            }

            if (kSummary.fulfilled > 0 || bSummary.fulfilled > 0 || compensated) {
              const refreshed = await supabase.rpc("get_order_delivery_for_user", {
                p_order_no: orderNo,
              });
              if (!refreshed.error && Array.isArray(refreshed.data)) {
                rows = refreshed.data as DeliveryRow[];
              }
            }

            if (rows.length === 0 && autoDeliveryTypes.has(String(paidOrder.delivery_type ?? "").toLowerCase())) {
              const [{ data: failedLogs }, { data: errSessions }, { data: manualAttempts }] = await Promise.all([
                service
                  .from("delivery_logs")
                  .select("message")
                  .eq("order_id", orderId)
                  .eq("event_type", "delivery_failed")
                  .order("created_at", { ascending: false })
                  .limit(1),
                service
                  .from("payment_sessions")
                  .select("last_error")
                  .eq("business_id", orderId)
                  .not("last_error", "is", null)
                  .order("updated_at", { ascending: false })
                  .limit(1),
                service
                  .from("supplier_purchase_attempts")
                  .select("status")
                  .like("logical_request_key", `jianlian:${orderId}:%`)
                  .in("status", ["MANUAL_REVIEW", "FAILED"])
                  .limit(1),
              ]);
              const hasFailureEvidence =
                (failedLogs?.length ?? 0) > 0 ||
                Boolean(errSessions?.[0]?.last_error) ||
                (manualAttempts?.length ?? 0) > 0 ||
                kSummary.uncertain > 0 ||
                ageMs >= 60_000;
              if (hasFailureEvidence) {
                needsManualSupport = true;
                manualSupportMessage =
                  "自动发货未能完成（上游已取消或转入人工核对），请携带订单号联系在线客服或提交工单，我们将为您优先人工补发或退款。";
              }
            }
          }
        }
      } catch {
        // Reconciliation is best-effort; never break delivery polling.
      }
    }
    if (rows.length === 0) {
      if (needsManualSupport) {
        return json({
          status: "manual_review",
          needs_support: true,
          deliveries: [],
          message: manualSupportMessage,
        });
      }
      return json({ status: "pending", deliveries: [], message: "正在处理" });
    }

    return json({
      status: rows.some((row) => row.delivery_status === "delivered") ? "delivered" : "pending",
      deliveries: rows.map((row, index) => ({
        id: row.delivery_id ?? `${orderNo}:${index}`,
        product_name: row.product_name ?? "—",
        delivery_status: row.delivery_status ?? "pending",
        delivery_type: row.delivery_type ?? "—",
        delivered_at: row.delivered_at,
        viewed_at: row.viewed_at,
        masked_content: row.masked_content ?? "—",
        content: row.content ?? null,
        delivery_note: row.delivery_note ?? null,
      })),
    });
  } catch (error) {
    logDeliveryDatabaseError(requestId, error);
    return json({ error: "交付信息加载失败，请稍后重试", request_id: requestId }, { status: 500 });
  }
}

