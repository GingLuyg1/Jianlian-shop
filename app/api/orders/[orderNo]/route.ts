import { NextResponse } from "next/server";

import { getOrderErrorMessage, getUserOrderByNo } from "@/lib/orders/order-queries";
import { canUserCancelOrder } from "@/lib/orders/order-status";
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
