import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { deliverDigitalOrder, getDeliveryErrorMessage } from "@/lib/delivery/delivery-service";
import type { PaymentCurrency } from "@/lib/payments/channel-types";
import { getSafeErrorMessage } from "@/lib/payments/payment-errors";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const COMPLETE_PAYMENT_SERVICE_IMPLEMENTED = true;

export type CompletePaymentInput = {
  paymentSessionId: string;
  providerTransactionId: string;
  amount: number;
  currency: PaymentCurrency | string;
  paidAt?: string | null;
  source: "callback" | "reconciliation";
};

export type CompletePaymentResult = {
  ok: true;
  idempotent: boolean;
  businessType: "order" | "recharge";
  businessId: string;
  businessNo: string | null;
  deliveryError?: string;
};

export async function completePayment(
  input: CompletePaymentInput,
  client?: SupabaseClient
): Promise<CompletePaymentResult> {
  const service = client ?? getSupabaseServiceRoleClient();
  if (!service) throw new Error("服务端支付密钥未配置，无法完成可信支付处理。");
  if (!input.providerTransactionId.trim()) throw new Error("渠道交易号为空，不能确认支付。");

  const { data, error } = await service.rpc("complete_payment_session", {
    p_session_id: input.paymentSessionId,
    p_provider_transaction_id: input.providerTransactionId.trim(),
    p_paid_amount: input.amount,
    p_currency: input.currency,
    p_paid_at: input.paidAt ?? new Date().toISOString(),
  });
  if (error) throw error;

  const result = normalizeResult(data);
  if (result.businessType === "order") {
    try {
      await deliverDigitalOrder(service, result.businessId, input.source);
    } catch (deliveryError) {
      const deliveryMessage = getDeliveryErrorMessage(deliveryError, "自动发货失败，等待人工处理");
      await service
        .from("payment_sessions")
        .update({ last_error: deliveryMessage })
        .eq("id", input.paymentSessionId);
      return { ...result, deliveryError: deliveryMessage };
    }
  }
  return result;
}

function normalizeResult(value: unknown): CompletePaymentResult {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const businessType = row.businessType === "order" ? "order" : "recharge";
  const businessId = String(row.businessId ?? "");
  if (!businessId) throw new Error("支付完成服务未返回业务 ID");
  return {
    ok: true,
    idempotent: row.idempotent === true,
    businessType,
    businessId,
    businessNo: typeof row.businessNo === "string" ? row.businessNo : null,
  };
}

export function getCompletePaymentErrorMessage(error: unknown) {
  return getSafeErrorMessage(error, "支付成功业务处理失败");
}
