import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { completePayment } from "@/lib/payments/complete-payment-service";
import { resolveProviderForExistingSession } from "@/lib/payments/providers";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { SNPAY_RECONCILIATION, snpayCandidateReason, snpayPaidDecision, snpayOrderParentReason, snpayOrderPaidDecision } from "@/lib/payments/snpay-reconciliation-policy.mjs";

type Row = Record<string, any>;
type Dependencies = {client?: SupabaseClient; query?: (session: Row) => Promise<Row>; nowMs?: number};
export type SnpayReconciliationResult = {kind:string;reason:string;queried:boolean;paid:boolean;completed:boolean;idempotent:boolean};
const result = (kind:string, reason:string, extra:Partial<SnpayReconciliationResult> = {}):SnpayReconciliationResult =>
  ({kind, reason, queried:false, paid:false, completed:false, idempotent:false, ...extra});
async function read(service:SupabaseClient, table:string, id:string) {
  const {data,error} = await service.from(table).select("*").eq("id",id).maybeSingle();
  if(error) throw Error("read_failed"); return data as Row | null;
}
function parentMatches(s:Row,r:Row|null) {
  return r && ["pending","processing","expired"].includes(r.status) && r.provider === "snpay"
    && r.channel_code === s.channel_code && r.user_id === s.user_id && r.recharge_no === s.business_no
    && r.currency === s.currency && Number(r.payable_amount) === Number(s.payable_amount)
    && Number(r.credited_amount) === 0 && !r.completed_at && Number.isFinite(Date.parse(r.created_at))
    && Number.isFinite(Date.parse(r.expires_at));
}
async function queryPinned(s:Row):Promise<Row> {
  const q = await resolveProviderForExistingSession(s).queryPayment(s.provider_order_no, {
    expectedSessionNo:s.session_no, expectedProviderOrderNo:s.provider_order_no,
    expectedChannel:s.channel_code, expectedAmount:s.payable_amount, expectedCurrency:"CNY",
    timeoutMs:SNPAY_RECONCILIATION.queryTimeoutMs,
  });
  return q as Row;
}
async function evidence(service:SupabaseClient,s:Row,q:Row|null,kind:string,reason:string,checkedAt:string) {
  const {error} = await service.from("payment_reconciliations").upsert({
    reconciliation_no:`REC${randomUUID().replace(/-/g,"")}`,
    payment_session_id:s.id,business_type:s.business_type === "order" ? "order" : "recharge",business_id:s.business_no,
    channel_code:s.channel_code,provider:"snpay",local_status:s.status,
    provider_status:q?.status ?? null,local_amount:s.payable_amount,
    provider_amount:q && Number.isFinite(Number(q.amount)) ? Number(q.amount) : null,currency:s.currency,
    result:kind === "completed" ? "resolved" : kind === "query_error" ? "query_failed" : kind === "manual_review" ? "manual_review" : "pending",
    error_code:reason,error_message:null,risk_level:kind === "manual_review" ? "high" : "normal",
    provider_summary:{found:q ? q.found === true : null,paid:q ? q.paid === true : null,paidAt:q?.paidAt ?? null,
      signatureVerified:q?.rawSummarySafe?.signatureVerified === true,
      timestampVerified:q?.rawSummarySafe?.timestampVerified === true,
      identityVerified:q?.rawSummarySafe?.identityVerified === true,
      businessType:s.business_type === "order" ? "order" : "recharge",
      manualReviewReason:kind === "manual_review" ? reason : null,
      paidTimeUntrusted:reason === "paid_time_untrusted",
      manualReviewPolicy:reason === "snpay_late_payment_manual_v1" ? reason : null},
    recovery_action:kind === "completed" ? "complete_payment" : null,
    recovery_status:kind,checked_at:checkedAt,updated_at:checkedAt,
    // Local terminal evidence must never overwrite previously verified paid
    // evidence when a later timer deliberately performs zero network queries.
    dedupe_key:`snpay-reconciliation-v1:${s.id}:${kind}:${reason}${q === null && ["order_inventory_released","order_terminal_before_reconciliation"].includes(reason) ? ":local" : ""}`,
  },{onConflict:"dedupe_key"});
  if(error) throw Error("evidence_write_failed");
}
export async function reconcileSnpaySession(
  options:{sessionId:string;execute?:boolean}, deps:Dependencies = {},
):Promise<SnpayReconciliationResult> {
  const service = deps.client ?? getSupabaseServiceRoleClient();
  if(!service) throw Error("configuration_missing");
  const execute = options.execute === true;
  if(execute && process.env.SNPAY_RECONCILIATION_EXECUTE_ENABLED !== "true") return result("skipped","execute_not_enabled");
  const nowMs = deps.nowMs ?? Date.now(), checkedAt = new Date(nowMs).toISOString();
  const s = await read(service,"payment_sessions",options.sessionId);
  if(!s) return result("skipped","session_missing");
  const exclusion = snpayCandidateReason(s,nowMs);
  if(exclusion) return result("skipped",exclusion);
  const isOrder = s.business_type === "order", parentTable = isOrder ? "orders" : "account_recharges";
  const r = await read(service,parentTable,s.business_id);
  const parentReason = isOrder ? snpayOrderParentReason(s,r) : parentMatches(s,r) ? null : "parent_context_excluded";
  if(parentReason) {
    const kind = ["order_inventory_released","order_terminal_before_reconciliation"].includes(parentReason) ? "manual_review" : "skipped";
    // Terminal parents require zero network, but remain visible and deduped.
    if(execute && kind === "manual_review") await evidence(service,s,null,kind,parentReason,checkedAt);
    return result(kind,parentReason);
  }
  const decide = isOrder ? snpayOrderPaidDecision : snpayPaidDecision;
  const siblings = await service.from("payment_sessions").select("id").eq("business_id",s.business_id).in("business_type",isOrder ? ["order"] : ["recharge","account_recharge"]);
  if(siblings.error) throw Error("read_failed");
  if(siblings.data?.length !== 1) return result("skipped","ambiguous_session");
  // Atomic compare-and-set claim: no status/amount writes. Two workers cannot
  // both query the same persisted last_synced version. Callback wins are safe.
  if(execute) {
    let claim = service.from("payment_sessions").update({last_synced_at:checkedAt})
      .eq("id",s.id).eq("provider","snpay").eq("status",s.status).eq("updated_at",s.updated_at);
    claim = s.last_synced_at == null ? claim.is("last_synced_at",null) : claim.eq("last_synced_at",s.last_synced_at);
    const claimed = await claim.select("id");
    if(claimed.error) throw Error("claim_failed");
    if(claimed.data?.length !== 1) return result("skipped","concurrent_claim_lost");
  }
  let q:Row;
  try {q = await (deps.query ?? queryPinned)(s);}
  catch (error) {
    const unsafePaidTime = (error as {code?:string})?.code === "SNPAY_PAID_AT_INVALID";
    const kind = unsafePaidTime ? "manual_review" : "query_error";
    const reason = unsafePaidTime ? "paid_time_untrusted" : "provider_query_failed";
    if(execute) await evidence(service,s,null,kind,reason,checkedAt);
    return result(kind,reason,{queried:true,paid:unsafePaidTime});
  }
  const decision = decide(s,r!,q,nowMs);
  let outcome = result(decision.kind,decision.reason,{queried:true,paid:q.paid === true});
  if(decision.kind === "complete") {
    // Re-read state and ownership after network I/O; terminal states never get
    // revived. Canonical RPC remains the final transactional race authority.
    const current = await read(service,"payment_sessions",s.id), parent = await read(service,parentTable,s.business_id);
    if(current?.status === "paid" && (isOrder ? parent?.payment_status === "paid" : ["paid","succeeded"].includes(parent?.status)))
      return result("skipped","already_completed",{queried:true,paid:true,idempotent:true});
    if(!current || (isOrder ? snpayOrderParentReason(current,parent) !== null : !parentMatches(current,parent)) || !["pending","processing","expired"].includes(current.status)
      || current.provider_order_no !== s.provider_order_no || current.session_no !== s.session_no
      || current.business_id !== s.business_id || current.user_id !== s.user_id || current.business_no !== s.business_no
      || current.business_type !== s.business_type || current.created_at !== s.created_at || parent?.created_at !== r?.created_at
      || current.provider !== s.provider || current.channel_code !== s.channel_code || current.currency !== s.currency
      || Number(current.payable_amount) !== Number(s.payable_amount)
      || current.expires_at !== s.expires_at || parent?.[isOrder ? "payment_expires_at" : "expires_at"] !== r?.[isOrder ? "payment_expires_at" : "expires_at"]
      || decide(current,parent!,q,nowMs).kind !== "complete") {
      const reason = isOrder ? snpayOrderParentReason(current ?? s,parent) ?? "order_state_changed" : "state_changed";
      if(isOrder && execute) await evidence(service,{...s,status:current?.status ?? s.status},q,"manual_review",reason,checkedAt);
      return result(isOrder ? "manual_review" : "skipped",reason,{queried:true,paid:true});
    }
    if(!execute) return result("would_complete","paid_before_expiry",{queried:true,paid:true});
    try {
      const done = await completePayment({paymentSessionId:s.id,providerTransactionId:q.providerTransactionId,
        amount:q.amount,currency:q.currency,paidAt:q.paidAt,source:"reconciliation"},service);
      outcome = result("completed","paid_before_expiry",{queried:true,paid:true,completed:true,idempotent:done.idempotent});
    } catch {outcome = result("manual_review","canonical_completion_failed",{queried:true,paid:true});}
  }
  if(execute) await evidence(service,s,q,outcome.kind,outcome.reason,checkedAt);
  return outcome;
}
