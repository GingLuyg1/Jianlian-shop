import type { SupabaseClient } from "@supabase/supabase-js";

export type DeliveryServiceResult = {
  ok: boolean;
  order_id?: string;
  delivered_count?: number;
  failed_count?: number;
  idempotent?: boolean;
  message?: string;
};

function rawMessage(error: unknown) {
  return (
    (error as { message?: string } | null | undefined)?.message ??
    (typeof error === "string" ? error : "")
  );
}

export function getDeliveryErrorMessage(error: unknown, fallback = "自动发货处理失败") {
  const message = rawMessage(error);

  if (
    message.includes("Could not find the function") ||
    message.includes("Could not find the table") ||
    message.includes("schema cache") ||
    message.includes("PGRST") ||
    message.includes("42P01") ||
    message.includes("42883")
  ) {
    return "数字发货功能尚未完成数据库初始化，请管理员执行数字发货 migration。";
  }

  if (message.includes("permission denied") || message.includes("无后台访问权限")) {
    return "无权执行自动发货操作";
  }

  if (message.includes("订单未支付")) return "订单未支付，不能发货";
  if (message.includes("商品不是自动发货商品")) return "商品不是自动发货商品";
  if (message.includes("库存不足")) return "自动发货库存不足，请人工处理";
  if (message.includes("订单不存在")) return "订单不存在";
  if (message.includes("取消") || message.includes("退款")) return "订单已取消或退款，不能发货";

  return message || fallback;
}

export async function deliverDigitalOrder(
  supabase: SupabaseClient,
  orderId: string,
  triggerSource = "server"
): Promise<DeliveryServiceResult> {
  const { data, error } = await supabase.rpc("deliver_digital_order", {
    p_order_id: orderId,
    p_trigger_source: triggerSource,
  });

  if (error) {
    try {
      await supabase.rpc("write_delivery_log", {
        p_order_id: orderId,
        p_order_item_id: null,
        p_inventory_id: null,
        p_trigger_source: triggerSource,
        p_event_type: "delivery_failed",
        p_message: getDeliveryErrorMessage(error),
        p_detail: {},
      });
    } catch {
      // Delivery logging is best-effort; the original delivery error is reported below.
    }

    throw new Error(getDeliveryErrorMessage(error));
  }

  const result = (data ?? { ok: true, delivered_count: 0, idempotent: true }) as DeliveryServiceResult;
  if (result.ok === false) {
    throw new Error(result.message || "自动发货处理失败，等待人工处理");
  }

  return result;
}
