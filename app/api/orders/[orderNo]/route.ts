import { NextResponse } from "next/server";

import { getOrderErrorMessage, getUserOrderByNo } from "@/lib/orders/order-queries";
import { canUserCancelOrder } from "@/lib/orders/order-status";
import type { OrderRecord } from "@/lib/orders/order-types";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    orderNo: string;
  };
};

function jsonError(message: string, status: number, code?: string) {
  return NextResponse.json({ error: message, ...(code ? { code } : {}) }, { status });
}

const BEP20_CANCEL_BLOCKING_STATUSES = new Set([
  "confirming",
  "verified",
  "completing",
  "manual_review",
  "underpaid",
  "payment_failed",
  "paid",
]);

async function assertBep20OrderCancelable(order: OrderRecord) {
  if (String(order.payment_method ?? "").toLowerCase() !== "usdt_bep20") {
    return { ok: true as const };
  }

  const service = getSupabaseServiceRoleClient();
  if (!service) {
    return {
      ok: false as const,
      status: 503,
      code: "BEP20_CANCEL_CHECK_UNAVAILABLE",
      message: "无法确认链上支付状态，请稍后重试。",
    };
  }

  const { data: sessions, error: sessionError } = await service
    .from("chain_payment_sessions")
    .select("id,status,submitted_tx_hash,manual_review_decision")
    .eq("order_id", order.id)
    .eq("payment_method", "usdt_bep20")
    .order("created_at", { ascending: false })
    .limit(10);

  if (sessionError) {
    return {
      ok: false as const,
      status: 503,
      code: "BEP20_CANCEL_CHECK_FAILED",
      message: "无法确认链上支付状态，请稍后重试。",
    };
  }

  const blockingSession = (sessions ?? []).find((session) => {
    const status = String(session.status ?? "").trim();
    return BEP20_CANCEL_BLOCKING_STATUSES.has(status);
  });

  if (blockingSession) {
    return {
      ok: false as const,
      status: 409,
      code: "BEP20_PAYMENT_IN_PROGRESS",
      message: "该订单已有链上支付处理记录，暂不能取消。",
    };
  }

  const { data: claims, error: claimError } = await service
    .from("chain_transaction_claims")
    .select("id")
    .eq("order_id", order.id)
    .limit(1);

  if (claimError) {
    return {
      ok: false as const,
      status: 503,
      code: "BEP20_CANCEL_CHECK_FAILED",
      message: "无法确认链上支付状态，请稍后重试。",
    };
  }

  if ((claims ?? []).length > 0) {
    return {
      ok: false as const,
      status: 409,
      code: "BEP20_TRANSACTION_CLAIMED",
      message: "该订单已有链上交易记录，暂不能取消。",
    };
  }

  return { ok: true as const };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    if (!hasSupabaseServerConfig()) {
      return jsonError("Supabase server configuration is missing.", 500);
    }

    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return jsonError("Please sign in first.", 401);
    }

    const order = await getUserOrderByNo(supabase, user.id, context.params.orderNo);
    if (!order) {
      return jsonError("Order does not exist or you do not have permission to view it.", 404);
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error("[Orders] detail failed", error);
    return jsonError(getOrderErrorMessage(error, "Order details could not be loaded."), 500);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    if (!hasSupabaseServerConfig()) {
      return jsonError("Supabase server configuration is missing.", 500);
    }

    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return jsonError("Please sign in first.", 401);
    }

    const order = await getUserOrderByNo(supabase, user.id, context.params.orderNo);
    if (!order) {
      return jsonError("Order does not exist or you do not have permission to view it.", 404);
    }

    const { data: allowCancelSetting } = await supabase.rpc("get_site_setting_boolean", {
      p_setting_key: "allow_user_cancel_pending_order",
      p_default: true,
    });

    if (allowCancelSetting === false) {
      return jsonError("User cancellation is currently disabled. Please contact support.", 400);
    }

    if (!canUserCancelOrder(order.status)) {
      return jsonError("This order status cannot be cancelled by the user.", 400, "ORDER_NOT_CANCELLABLE");
    }

    const bep20CancelGuard = await assertBep20OrderCancelable(order);
    if (!bep20CancelGuard.ok) {
      return jsonError(bep20CancelGuard.message, bep20CancelGuard.status, bep20CancelGuard.code);
    }

    const body = (await request.json().catch(() => null)) as { reason?: string | null } | null;
    const reason = String(body?.reason ?? "user_cancelled").trim().slice(0, 120) || "user_cancelled";

    const { data: cancelResult, error: cancelError } = await supabase.rpc("cancel_unpaid_order", {
      p_order_id: order.id,
      p_reason: reason,
    });

    if (cancelError) {
      return jsonError(getOrderErrorMessage(cancelError, "Order cancellation failed."), 400);
    }

    const result = cancelResult && typeof cancelResult === "object" ? (cancelResult as Record<string, unknown>) : {};
    if (result.ok === false) {
      const code = typeof result.code === "string" ? result.code : "ORDER_CANCEL_FAILED";
      const status = code === "ORDER_NOT_FOUND" ? 404 : 400;
      return jsonError(typeof result.message === "string" ? result.message : "Order cancellation failed.", status, code);
    }

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[Orders] cancel failed", error);
    return jsonError(getOrderErrorMessage(error, "Order cancellation failed."), 500);
  }
}
