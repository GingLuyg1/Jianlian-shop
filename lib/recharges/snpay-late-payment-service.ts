import "server-only";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { snpayProvider } from "@/lib/payments/providers/snpay";
import {
  latePaymentFailure, pinLatePaymentContext, validateLatePaymentEvidence, validateLatePaymentReason,
} from "@/lib/recharges/snpay-late-payment-policy.mjs";

type Input = { rechargeId: string; adminId: string; reason: string; requestId: string };

// Authenticated admin route is the only caller; RPC independently verifies admin authority.
export async function approveSnpayLatePayment(input: Input) {
  const reason = validateLatePaymentReason(input.reason);
  if (!input.adminId) throw latePaymentFailure("LATE_PAYMENT_ADMIN_REQUIRED");
  const service = getSupabaseServiceRoleClient();
  if (!service) throw latePaymentFailure("LATE_PAYMENT_SERVICE_UNAVAILABLE");
  const { data: recharge, error } = await service.from("account_recharges")
    .select("id,recharge_no,user_id,provider,channel_code,currency,status,amount,requested_amount,payable_amount,credited_amount,paid_at,completed_at,exception_type,created_at,expires_at")
    .eq("id", input.rechargeId).maybeSingle();
  if (error || !recharge) throw latePaymentFailure("LATE_PAYMENT_RECHARGE_UNAVAILABLE");
  const [sessions, ledger] = await Promise.all([
    service.from("payment_sessions")
      .select("id,session_no,business_type,business_id,business_no,user_id,provider,channel_code,currency,status,payable_amount,provider_order_no,created_at,expires_at")
      .eq("business_id", recharge.id).eq("business_type", "recharge"),
    service.from("balance_transactions").select("user_id,business_type,business_id,status,direction,amount")
      .eq("business_id", recharge.recharge_no),
  ]);
  if (sessions.error || ledger.error) throw latePaymentFailure("LATE_PAYMENT_CONTEXT_UNAVAILABLE");
  const context = pinLatePaymentContext(recharge, sessions.data ?? [], ledger.data ?? []);
  // Exactly one live query, no retries, using persisted identity, never client evidence.
  let query;
  try {
    query = await snpayProvider.queryPayment(context.session.provider_order_no, {
      expectedProviderOrderNo: context.session.provider_order_no,
      expectedSessionNo: context.session.session_no,
      expectedChannel: context.session.channel_code,
      expectedCurrency: "CNY", expectedAmount: context.principal,
    });
  } catch {
    throw latePaymentFailure("LATE_PAYMENT_PROVIDER_VERIFICATION_FAILED");
  }
  const evidence = validateLatePaymentEvidence(context, query);
  const { data, error: rpcError } = await service.rpc("complete_account_recharge_late_payment_manual_v1", {
    p_recharge_id: recharge.id, p_session_id: context.session.id, p_user_id: recharge.user_id,
    p_session_no: context.session.session_no, p_provider_order_no: context.session.provider_order_no,
    p_amount: context.principal, p_paid_at: evidence.providerPaidAt,
    p_recharge_created_at: recharge.created_at, p_recharge_expires_at: recharge.expires_at,
    p_session_created_at: context.session.created_at, p_session_expires_at: context.session.expires_at,
    p_admin_id: input.adminId, p_reason: reason, p_request_id: input.requestId,
  });
  // Ambiguous transport errors are never retried; administrator must inspect ledger.
  if (rpcError || data?.ok !== true || ![true, false].includes(data?.idempotent)) {
    throw latePaymentFailure("LATE_PAYMENT_RPC_OUTCOME_REQUIRES_RECONCILIATION");
  }
  return { idempotent: data.idempotent as boolean, evidence, reason };
}
