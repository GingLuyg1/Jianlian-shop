import { NextResponse } from "next/server";
import { getOrderErrorMessage } from "@/lib/orders/order-queries";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: { orderNo: string } };

type FulfillmentRow = {
  order_item_id: string;
  product_name: string | null;
  delivery_status: string | null;
  delivery_type: string | null;
  quantity: number | null;
  delivered_quantity: number | null;
  delivered_at: string | null;
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

function sanitizeFulfillmentError(error: unknown) {
  const message = getOrderErrorMessage(error, "交付信息读取失败");
  if (/Could not find|schema cache|PGRST|42883|42P01/i.test(message)) {
    return "订单项交付功能尚未完成数据库初始化，请先执行混合交付 migration。";
  }
  if (message.includes("未支付")) return "订单未支付，不能查看交付内容";
  if (message.includes("无权") || message.includes("不存在")) return "订单不存在或无权查看";
  return message || "交付信息读取失败";
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    if (!hasSupabaseServerConfig()) return json({ error: "Supabase 环境变量未配置" }, { status: 500 });

    const supabase = getSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: "请先登录" }, { status: 401 });

    const { data, error } = await supabase.rpc("get_order_fulfillment_for_user", {
      p_order_no: context.params.orderNo,
    });
    if (error) {
      const message = sanitizeFulfillmentError(error);
      return json({ error: message }, { status: message.includes("未支付") ? 403 : 400 });
    }

    const rows = (data ?? []) as FulfillmentRow[];
    return json({
      deliveries: rows.map((row) => ({
        order_item_id: row.order_item_id,
        product_name: row.product_name ?? "—",
        delivery_status: row.delivery_status ?? "pending",
        delivery_type: row.delivery_type ?? "manual_delivery",
        quantity: Number(row.quantity ?? 1),
        delivered_quantity: Number(row.delivered_quantity ?? 0),
        delivered_at: row.delivered_at,
        masked_content: row.masked_content ?? null,
        content: row.content ?? null,
        delivery_note: row.delivery_note ?? null,
      })),
    });
  } catch (error) {
    return json({ error: sanitizeFulfillmentError(error) }, { status: 500 });
  }
}
