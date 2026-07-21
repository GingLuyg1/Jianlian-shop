import { NextResponse } from "next/server";
import { getOrderErrorMessage } from "@/lib/orders/order-queries";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { assertUserBusinessAllowed, isAccountRestrictionError } from "@/lib/users/account-guard";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    orderNo: string;
  };
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

function sanitizeDeliveryError(error: unknown) {
  const message = getOrderErrorMessage(error, "交付内容读取失败");
  if (
    message.includes("Could not find") ||
    message.includes("schema cache") ||
    message.includes("PGRST") ||
    message.includes("42883") ||
    message.includes("42P01")
  ) {
    return "数字发货功能尚未完成数据库初始化，请管理员执行数字发货 migration。";
  }
  if (message.includes("未支付")) return "订单未支付，不能查看交付内容";
  if (message.includes("无权") || message.includes("不存在")) return "订单不存在或无权查看";
  return message;
}

export async function GET(_request: Request, context: RouteContext) {
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

    try {
      await assertUserBusinessAllowed(supabase, user.id, "view_delivery");
    } catch (guardError) {
      if (isAccountRestrictionError(guardError)) {
        return json({ error: guardError.message, code: guardError.code }, { status: guardError.status });
      }
      throw guardError;
    }

    const { data, error } = await supabase.rpc("get_order_delivery_for_user", {
      p_order_no: context.params.orderNo,
    });

    if (error) {
      const message = sanitizeDeliveryError(error);
      const status = message.includes("未支付") ? 403 : message.includes("无权") ? 404 : 400;
      return json({ error: message }, { status });
    }

    const rows = (data ?? []) as DeliveryRow[];
    if (rows.length === 0) {
      return json({ status: "pending", deliveries: [], message: "正在处理" });
    }

    return json({
      status: rows.some((row) => row.delivery_status === "delivered") ? "delivered" : "pending",
      deliveries: rows.map((row, index) => ({
        id: row.delivery_id ?? `${context.params.orderNo}:${index}`,
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
    console.error("[Orders] delivery content failed");
    return json({ error: sanitizeDeliveryError(error) }, { status: 500 });
  }
}

