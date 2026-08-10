import type { SupabaseClient } from "@supabase/supabase-js";

import { fulfillDajuOrderWithSupabase } from "@/lib/providers/daju/fulfillment";
import { runLocalStockPriorityDelivery } from "./local-stock-priority.mjs";

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

  if (message.includes("permission denied") || message.includes("requires service role") || message.includes("access denied")) {
    return "无权执行自动发货操作";
  }

  if (message.includes("not paid") || message.includes("未支付")) return "订单未支付，不能发货";
  if (message.includes("not found") || message.includes("不存在")) return "订单不存在或无权查看";
  if (message.includes("not allow delivery") || message.includes("取消") || message.includes("过期") || message.includes("退款")) {
    return "订单当前状态不能发货";
  }
  if (message.includes("reserved inventory is insufficient") || message.includes("库存不足")) {
    return "自动发货库存不足，请人工处理";
  }
  if (message.includes("state changed")) return "库存状态已变化，请稍后重试或人工处理";

  return message || fallback;
}

export async function deliverDigitalOrder(
  supabase: SupabaseClient,
  orderId: string,
  triggerSource = "server"
): Promise<DeliveryServiceResult> {
  const priority = await runLocalStockPriorityDelivery({
    reserveLocal: async () => {
      const { data, error } = await supabase.rpc("reserve_local_inventory_for_daju_order", {
        p_order_id: orderId,
        p_trigger_source: triggerSource,
      });
      if (error) throw new Error("LOCAL_STOCK_PRIORITY_RESERVATION_FAILED");
      return data;
    },
    deliverLocal: async () => {
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
      return data;
    },
    deliverSupplier: () => fulfillDajuOrderWithSupabase(supabase, orderId, triggerSource),
  });
  const supplier = priority.supplier;
  if (supplier.uncertain > 0) {
    throw new Error("供应商采购结果不明确，禁止自动重试，请人工核对");
  }
  if (supplier.failed > 0 || supplier.needsInput > 0) {
    throw new Error("供应商自动发货未完成，请在后台人工处理");
  }

  const result = (priority.local ?? { ok: true, delivered_count: 0, idempotent: true }) as DeliveryServiceResult;
  if (result.ok === false) {
    throw new Error(result.message || "自动发货处理失败，等待人工处理");
  }

  return {
    ...result,
    delivered_count: Number(result.delivered_count ?? 0) + supplier.fulfilled,
  };
}
