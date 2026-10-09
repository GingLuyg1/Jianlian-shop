import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminPaymentRecord } from "./admin-payment-types";

// Explicit read-only enrichment. No current channel/provider inference and no
// raw session metadata/artifact disclosure. Ambiguous history stays unavailable.
export async function enrichAdminOrderSessionEvidence(service: SupabaseClient, raw: Record<string, any>, payment: AdminPaymentRecord) {
  if (payment.business_type !== "order" || !raw.order_id || !raw.user_id) return payment;
  const {data,error} = await service.from("payment_sessions")
    .select("id,session_no,business_id,business_no,user_id,provider,channel_code,currency,payable_amount,status,provider_transaction_id,paid_at,reconcile_status,last_error")
    .eq("business_type","order").eq("business_id",raw.order_id).eq("user_id",raw.user_id).limit(101);
  if (error) return {...payment,session_evidence_status:"unavailable"};
  const matches = (data ?? []).filter(s => s.business_no === payment.business_no && s.channel_code === payment.channel
    && s.currency === payment.payable_currency && Number(s.payable_amount) === payment.payable_amount
    && (raw.payment_no === `AUTO-${s.session_no}` || (raw.provider_trade_no && s.provider_transaction_id === raw.provider_trade_no)));
  if (data?.length === 101 || matches.length !== 1) return {...payment,session_evidence_status:"ambiguous_or_missing"};
  const s = matches[0];
  return {...payment,provider:s.provider,payment_session_no:s.session_no,payment_session_status:s.status,
    reconciliation_status:s.reconcile_status,session_evidence_status:"pinned",payment_session_error:s.last_error,
    provider_trade_no:payment.provider_trade_no ?? s.provider_transaction_id,paid_at:payment.paid_at ?? s.paid_at};
}
