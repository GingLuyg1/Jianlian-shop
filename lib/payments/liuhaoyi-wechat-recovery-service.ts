import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { completePayment } from "@/lib/payments/complete-payment-service";
import {
  evaluateLiuhaoyiWechatRechargeRecovery,
  liuhaoyiPaidTimeMs,
} from "@/lib/payments/liuhaoyi-recovery-policy.mjs";
import { getPaymentProvider, normalizeProviderPaymentStatus } from "@/lib/payments/providers";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export type WechatRecoveryResult = {
  mode: "dry_run" | "execute";
  sessionNo: string;
  sessionFound: boolean;
  rechargeFound: boolean;
  providerFound: boolean;
  providerPaid: boolean;
  providerTypeMatch: boolean;
  amountMatch: boolean;
  paidWithinExpiry: boolean;
  localAlreadyCredited: boolean;
  ledgerCount: number;
  eligible: boolean;
  wouldComplete: boolean;
  completed: boolean;
  idempotent: boolean;
  manualReview: boolean;
  reason: string;
};

const SESSION_SELECT = "id,session_no,business_type,business_id,business_no,user_id,channel_code,provider,provider_order_no,provider_transaction_id,status,payable_amount,currency,expires_at,created_at";

export async function runLiuhaoyiWechatRechargeRecovery(
  input: { sessionNo: string; execute?: boolean },
  client?: SupabaseClient,
): Promise<WechatRecoveryResult> {
  const sessionNo = String(input.sessionNo ?? "").trim();
  if (!/^PS[A-Za-z0-9_-]{8,157}$/.test(sessionNo)) throw new Error("WECHAT_RECOVERY_SESSION_INVALID");
  const execute = input.execute === true;
  const service = client ?? getSupabaseServiceRoleClient();
  if (!service) throw new Error("WECHAT_RECOVERY_SERVICE_UNAVAILABLE");

  const { data: sessionRow, error: sessionError } = await service
    .from("payment_sessions")
    .select(SESSION_SELECT)
    .eq("session_no", sessionNo)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!sessionRow) return emptyResult(sessionNo, execute, "session_not_found");
  const session = normalizeSession(sessionRow as Record<string, unknown>);

  const { data: rechargeRow, error: rechargeError } = await service
    .from("account_recharges")
    .select("id,recharge_no,user_id,status,expires_at,credited_amount,completed_at")
    .eq("id", session.businessId)
    .maybeSingle();
  if (rechargeError) throw rechargeError;
  const recharge = rechargeRow ? normalizeRecharge(rechargeRow as Record<string, unknown>) : null;

  let ledgerCount = 0;
  if (recharge) {
    const { count, error: ledgerError } = await service
      .from("balance_transactions")
      .select("id", { count: "exact", head: true })
      .eq("business_type", "account_recharge")
      .eq("business_id", recharge.rechargeNo)
      .eq("status", "completed");
    if (ledgerError) throw ledgerError;
    ledgerCount = Number(count ?? 0);
  }

  const query = await getPaymentProvider("liuhaoyi").queryPayment(sessionNo) as Record<string, unknown>;
  const rawSummary = query.rawSummary && typeof query.rawSummary === "object"
    ? query.rawSummary as Record<string, unknown>
    : {};
  const provider = {
    found: rawSummary.found === true,
    status: normalizeProviderPaymentStatus(query.status),
    currency: text(query.currency) ?? "CNY",
    amount: typeof query.amount === "string" || typeof query.amount === "number" ? query.amount : null,
    type: text(rawSummary.type),
    tradeNo: text(query.providerTransactionId),
    outTradeNo: text(rawSummary.outTradeNo),
    endtime: text(rawSummary.endtime),
    paidAt: text(query.paidAt),
  };
  const decision = evaluateLiuhaoyiWechatRechargeRecovery({ session, recharge, provider, ledgerCount });
  const providerPaid = provider.found && provider.status === "paid";
  const amountMatch = cnyEqual(session.localAmount, provider.amount);
  const paidAtMs = liuhaoyiPaidTimeMs(provider.endtime ?? provider.paidAt);
  const paidWithinExpiry = Boolean(recharge)
    && Number.isFinite(paidAtMs)
    && paidAtMs <= Date.parse(String(session.expiresAt ?? ""))
    && paidAtMs <= Date.parse(String(recharge?.expiresAt ?? ""));
  const localAlreadyCredited = session.localStatus === "paid"
    || Boolean(recharge?.completedAt)
    || Number(recharge?.creditedAmount ?? 0) !== 0
    || ledgerCount > 0;

  let completed = false;
  let idempotent = false;
  if (execute && decision.eligible) {
    const completion = await completePayment({
      paymentSessionId: session.id,
      providerTransactionId: provider.tradeNo ?? "",
      amount: provider.amount ?? String(session.localAmount ?? ""),
      currency: "CNY",
      paidAt: Number.isFinite(paidAtMs) ? new Date(paidAtMs).toISOString() : null,
      source: "reconciliation",
    }, service);
    completed = true;
    idempotent = completion.idempotent;
  } else if (execute && decision.manualReview && providerPaid) {
    await persistManualReviewEvidence(service, session, provider, decision.reason);
  }

  return {
    mode: execute ? "execute" : "dry_run",
    sessionNo,
    sessionFound: true,
    rechargeFound: Boolean(recharge),
    providerFound: provider.found,
    providerPaid,
    providerTypeMatch: provider.type === "wxpay",
    amountMatch,
    paidWithinExpiry,
    localAlreadyCredited,
    ledgerCount,
    eligible: decision.eligible,
    wouldComplete: decision.eligible,
    completed,
    idempotent,
    manualReview: decision.manualReview,
    reason: decision.reason,
  };
}

function normalizeSession(row: Record<string, unknown>) {
  return {
    id: String(row.id), sessionNo: String(row.session_no), businessType: String(row.business_type),
    businessId: String(row.business_id), businessNo: text(row.business_no), userId: String(row.user_id),
    channelCode: String(row.channel_code), provider: String(row.provider), providerOrderNo: text(row.provider_order_no),
    localTradeNo: text(row.provider_transaction_id), localStatus: normalizeProviderPaymentStatus(row.status),
    localAmount: row.payable_amount, currency: String(row.currency), expiresAt: text(row.expires_at), createdAt: text(row.created_at),
  };
}

function normalizeRecharge(row: Record<string, unknown>) {
  return {
    id: String(row.id), rechargeNo: String(row.recharge_no), userId: String(row.user_id), status: String(row.status),
    expiresAt: text(row.expires_at), creditedAmount: row.credited_amount, completedAt: text(row.completed_at),
  };
}

async function persistManualReviewEvidence(service: SupabaseClient, session: ReturnType<typeof normalizeSession>, provider: Record<string, unknown>, reason: string) {
  const checkedAt = new Date().toISOString();
  const tradeNo = text(provider.tradeNo);
  const { error } = await service.from("payment_reconciliations").upsert({
    reconciliation_no: `REC${checkedAt.replace(/\D/g, "").slice(0, 14)}WXMANUAL`,
    payment_session_id: session.id,
    business_type: "recharge",
    business_id: session.businessNo ?? session.businessId,
    channel_code: "wechat",
    provider: "liuhaoyi",
    local_status: session.localStatus,
    provider_status: "paid",
    local_amount: session.localAmount,
    provider_amount: provider.amount,
    currency: "CNY",
    result: "manual_review",
    difference_type: "provider_paid_local_unpaid",
    risk_level: "high",
    provider_trade_no: tradeNo,
    local_trade_no: session.localTradeNo,
    error_code: `WECHAT_RECOVERY_${reason.toUpperCase()}`,
    error_message: "六号易微信已支付但不满足自动恢复条件，需要人工复核。",
    provider_summary: { found: true, paid: true, type: provider.type, tradeNoPresent: Boolean(tradeNo), endtime: provider.endtime },
    checked_at: checkedAt,
    recovery_action: null,
    recovery_status: "manual_review",
    dedupe_key: `wechat-recovery:${session.id}:${reason}:${tradeNo ?? "missing"}`,
    updated_at: checkedAt,
  }, { onConflict: "dedupe_key" });
  if (error) throw error;
}

function emptyResult(sessionNo: string, execute: boolean, reason: string): WechatRecoveryResult {
  return { mode: execute ? "execute" : "dry_run", sessionNo, sessionFound: false, rechargeFound: false, providerFound: false, providerPaid: false, providerTypeMatch: false, amountMatch: false, paidWithinExpiry: false, localAlreadyCredited: false, ledgerCount: 0, eligible: false, wouldComplete: false, completed: false, idempotent: false, manualReview: false, reason };
}

function cnyEqual(left: unknown, right: unknown) {
  const cents = (value: unknown) => {
    const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(String(value ?? "").trim());
    if (!match) return null;
    const result = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
    return Number.isSafeInteger(result) ? result : null;
  };
  const a = cents(left); const b = cents(right);
  return a !== null && b !== null && a === b;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
