import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { deliverDigitalOrder, getDeliveryErrorMessage } from "@/lib/delivery/delivery-service";
import { getOrderErrorMessage } from "@/lib/orders/order-queries";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type BalancePaymentRow = {
  ok?: boolean;
  idempotent?: boolean;
  orderId?: string;
  orderNo?: string;
  paymentStatus?: string;
  status?: string;
  transactionNo?: string | null;
};

export type PayOrderWithBalanceInput = {
  orderId: string;
  userId: string;
  clientRequestId?: string | null;
};

export type PayOrderWithBalanceResult = {
  ok: true;
  idempotent: boolean;
  orderId: string;
  orderNo: string | null;
  paymentStatus: string;
  status: string;
  transactionNo: string | null;
  deliveryError?: string;
};

export async function payOrderWithBalance(
  input: PayOrderWithBalanceInput,
  client?: SupabaseClient
): Promise<PayOrderWithBalanceResult> {
  const service = client ?? getSupabaseServiceRoleClient();
  if (!service) throw new Error("服务端余额支付未配置");

  const { data, error } = await service.rpc("pay_order_with_balance", {
    p_order_id: input.orderId,
    p_user_id: input.userId,
    p_client_request_id: input.clientRequestId ?? null,
  });

  if (error) throw error;

  const result = normalizeBalancePaymentResult(data, input.orderId);

  try {
    await deliverDigitalOrder(service, result.orderId, "balance_payment");
  } catch (deliveryError) {
    return {
      ...result,
      deliveryError: getDeliveryErrorMessage(deliveryError, "自动发货失败，等待人工处理"),
    };
  }

  return result;
}

function normalizeBalancePaymentResult(value: unknown, fallbackOrderId: string): PayOrderWithBalanceResult {
  const row = value && typeof value === "object" ? (value as BalancePaymentRow) : {};
  const orderId = String(row.orderId ?? fallbackOrderId ?? "");
  if (!orderId) throw new Error("余额支付服务未返回订单 ID");

  return {
    ok: true,
    idempotent: row.idempotent === true,
    orderId,
    orderNo: typeof row.orderNo === "string" ? row.orderNo : null,
    paymentStatus: typeof row.paymentStatus === "string" ? row.paymentStatus : "paid",
    status: typeof row.status === "string" ? row.status : "paid",
    transactionNo: typeof row.transactionNo === "string" ? row.transactionNo : null,
  };
}

export function getBalancePaymentErrorMessage(error: unknown) {
  return getOrderErrorMessage(error, "余额支付失败，请稍后重试");
}
