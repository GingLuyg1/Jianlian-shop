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

export async function GET(_request: Request, context: RouteContext) {
  try {
    if (!hasSupabaseServerConfig()) {
      return NextResponse.json({ error: "Supabase 环境变量未配置" }, { status: 500 });
    }

    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const order = await getUserOrderByNo(supabase, user.id, context.params.orderNo);

    if (!order) {
      return NextResponse.json({ error: "订单不存在或无权查看" }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error("[Orders] detail failed", error);
    return NextResponse.json(
      { error: getOrderErrorMessage(error, "订单详情读取失败") },
      { status: 500 }
    );
  }
}

export async function PATCH(_request: Request, context: RouteContext) {
  try {
    if (!hasSupabaseServerConfig()) {
      return NextResponse.json({ error: "Supabase 环境变量未配置" }, { status: 500 });
    }

    const supabase = getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const order = await getUserOrderByNo(supabase, user.id, context.params.orderNo);

    if (!order) {
      return NextResponse.json({ error: "订单不存在或无权查看" }, { status: 404 });
    }

    const { data: allowCancelSetting } = await supabase.rpc(
      "get_site_setting_boolean",
      {
        p_setting_key: "allow_user_cancel_pending_order",
        p_default: true,
      }
    );

    if (allowCancelSetting === false) {
      return NextResponse.json(
        { error: "当前不允许用户自行取消订单，请联系客服处理" },
        { status: 400 }
      );
    }

    if (!canUserCancelOrder(order.status)) {
      return NextResponse.json(
        { error: "当前订单状态不允许取消" },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("user_id", user.id)
      .eq("status", "pending_payment");

    if (updateError) {
      return NextResponse.json(
        { error: getOrderErrorMessage(updateError, "订单取消失败") },
        { status: 400 }
      );
    }

    await supabase.from("order_status_logs").insert({
      order_id: order.id,
      from_status: order.status,
      to_status: "cancelled",
      operator_id: user.id,
      operator_type: "user",
      note: "用户取消订单",
    });

    await supabase.rpc("release_order_inventory", {
      p_order_id: order.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Orders] cancel failed", error);
    return NextResponse.json(
      { error: getOrderErrorMessage(error, "订单取消失败") },
      { status: 500 }
    );
  }
}
