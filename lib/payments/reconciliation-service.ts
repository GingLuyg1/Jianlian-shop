import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { completePayment } from "@/lib/payments/complete-payment-service";
import type { PaymentProviderCode, PaymentSessionStatus } from "@/lib/payments/channel-types";
import { getSafeErrorMessage } from "@/lib/payments/payment-errors";
import {
  getPaymentProvider,
  normalizeProviderPaymentStatus,
  PaymentProviderError,
} from "@/lib/payments/providers";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const RECONCILIATION_USES_COMPLETE_PAYMENT = true;
export const RECONCILIATION_RESULTS = [
  "matched",
  "mismatched",
  "pending",
  "query_failed",
  "manual_review",
  "resolved",
] as const;
export type ReconciliationResult = (typeof RECONCILIATION_RESULTS)[number];

export const RECONCILIATION_DIFFERENCE_TYPES = [
  "provider_paid_local_unpaid",
  "local_paid_provider_unpaid",
  "amount_mismatch",
  "currency_mismatch",
  "transaction_id_conflict",
  "status_mismatch",
  "provider_not_found",
] as const;
export type ReconciliationDifferenceType = (typeof RECONCILIATION_DIFFERENCE_TYPES)[number];

export type ReconciliationRecord = {
  id: string;
  reconciliation_no: string;
  payment_session_id: string | null;
  business_type: "order" | "recharge";
  business_id: string | null;
  channel_code: string | null;
  provider: string | null;
  local_status: string | null;
  provider_status: string | null;
  local_amount: number;
  provider_amount: number | null;
  currency: string;
  result: ReconciliationResult;
  difference_type: ReconciliationDifferenceType | null;
  error_code: string | null;
  error_message: string | null;
  checked_at: string;
  resolved_at: string | null;
  resolution: string | null;
  risk_level: "normal" | "medium" | "high";
  provider_trade_no: string | null;
  local_trade_no: string | null;
  provider_summary: Record<string, unknown>;
  recovery_action: string | null;
  recovery_status: string | null;
  recovery_error: string | null;
  created_at: string;
  updated_at: string;
};

type PaymentSession = {
  id: string;
  sessionNo: string;
  businessType: "order" | "recharge";
  businessId: string;
  businessNo: string | null;
  channelCode: string;
  provider: PaymentProviderCode | null;
  providerOrderNo: string | null;
  localStatus: PaymentSessionStatus;
  localAmount: number;
  currency: string;
  localTradeNo: string | null;
  updatedAt: string | null;
  createdAt: string | null;
};

type ProviderSummary = {
  status: PaymentSessionStatus | "not_found";
  amount: number | null;
  currency: string | null;
  tradeNo: string | null;
  paidAt: string | null;
  rawStatus: string | null;
};

type ReconciliationComparison = {
  result: ReconciliationResult;
  differenceType: ReconciliationDifferenceType | null;
  errorCode: string | null;
  errorMessage: string | null;
  recoveryAction: string | null;
  recoveryStatus: string | null;
  recoveryError: string | null;
};

export type ReconciliationRunOptions = {
  paymentSessionId?: string;
  businessType?: "order" | "recharge";
  batchSize?: number;
  dryRun?: boolean;
  reason?: string;
};

export type ReconciliationRunResult = {
  processed: number;
  matched: number;
  mismatched: number;
  pending: number;
  query_failed: number;
  manual_review: number;
  resolved: number;
  skipped: number;
  records: ReconciliationRecord[];
  errors: Array<{ paymentSessionId?: string; message: string }>;
};

const SESSION_SELECT =
  "id,session_no,business_type,business_id,business_no,channel_code,provider,provider_order_no,status,payable_amount,currency,provider_transaction_id,updated_at,created_at";

export function normalizeProviderStatus(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["not_found", "missing"].includes(raw)) return "not_found";
  return normalizeProviderPaymentStatus(raw);
}

export function normalizeReconciliationRow(row: Record<string, unknown>): ReconciliationRecord {
  return {
    id: String(row.id ?? ""),
    reconciliation_no: String(row.reconciliation_no ?? ""),
    payment_session_id: text(row.payment_session_id),
    business_type: row.business_type === "recharge" ? "recharge" : "order",
    business_id: text(row.business_id),
    channel_code: text(row.channel_code),
    provider: text(row.provider),
    local_status: text(row.local_status),
    provider_status: text(row.provider_status),
    local_amount: number(row.local_amount),
    provider_amount: row.provider_amount == null ? null : number(row.provider_amount),
    currency: String(row.currency ?? "CNY"),
    result: RECONCILIATION_RESULTS.includes(row.result as ReconciliationResult)
      ? (row.result as ReconciliationResult)
      : "pending",
    difference_type: RECONCILIATION_DIFFERENCE_TYPES.includes(
      row.difference_type as ReconciliationDifferenceType
    )
      ? (row.difference_type as ReconciliationDifferenceType)
      : null,
    error_code: text(row.error_code),
    error_message: text(row.error_message),
    checked_at: String(row.checked_at ?? ""),
    resolved_at: text(row.resolved_at),
    resolution: text(row.resolution),
    risk_level: row.risk_level === "high" || row.risk_level === "medium" ? row.risk_level : "normal",
    provider_trade_no: text(row.provider_trade_no),
    local_trade_no: text(row.local_trade_no),
    provider_summary:
      row.provider_summary && typeof row.provider_summary === "object"
        ? (row.provider_summary as Record<string, unknown>)
        : {},
    recovery_action: text(row.recovery_action),
    recovery_status: text(row.recovery_status),
    recovery_error: text(row.recovery_error),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? row.created_at ?? ""),
  };
}

export function normalizeReconciliationRows(rows: Record<string, unknown>[]) {
  return rows.map(normalizeReconciliationRow);
}

export function isReconciliationSchemaMissing(error: unknown) {
  return /payment_reconciliations|payment_sessions|schema cache|PGRST205|42P01|42703/i.test(
    getSafeErrorMessage(error, "")
  );
}

export function getReconciliationErrorMessage(error: unknown, fallback = "支付对账数据加载失败") {
  if (isReconciliationSchemaMissing(error)) {
    return "支付对账或支付会话表尚未初始化，请先执行支付 migration。";
  }
  if (error instanceof PaymentProviderError) return error.message;
  return getSafeErrorMessage(error, fallback);
}

export async function runPaymentReconciliation(
  options: ReconciliationRunOptions = {},
  client?: SupabaseClient
): Promise<ReconciliationRunResult> {
  const supabase = client ?? getSupabaseServiceRoleClient();
  if (!supabase) throw new Error("服务端支付对账密钥未配置");

  const output: ReconciliationRunResult = {
    processed: 0,
    matched: 0,
    mismatched: 0,
    pending: 0,
    query_failed: 0,
    manual_review: 0,
    resolved: 0,
    skipped: 0,
    records: [],
    errors: [],
  };
  const batchSize = Math.min(100, Math.max(1, Number(options.batchSize ?? 20)));
  const sessions = options.paymentSessionId
    ? [await readSession(supabase, options.paymentSessionId, options.businessType)]
    : await listSessions(supabase, batchSize, options.businessType);

  for (const session of sessions) {
    if (!session) {
      output.skipped += 1;
      continue;
    }
    try {
      const record = await reconcileOne(supabase, session, Boolean(options.dryRun));
      output.processed += 1;
      output[record.result] += 1;
      output.records.push(record);
    } catch (error) {
      output.errors.push({
        paymentSessionId: session.id,
        message: getReconciliationErrorMessage(error, "单笔支付对账处理失败"),
      });
    }
  }
  return output;
}

async function reconcileOne(supabase: SupabaseClient, session: PaymentSession, dryRun: boolean) {
  let provider: ProviderSummary;
  try {
    provider = await queryProvider(session);
  } catch (error) {
    return record(
      supabase,
      session,
      emptyProvider(),
      {
        result: "query_failed",
        differenceType: null,
        errorCode: error instanceof PaymentProviderError ? "provider_unconfigured" : "provider_query_failed",
        errorMessage:
          error instanceof PaymentProviderError ? error.message : "渠道查询失败，请稍后重试。",
        recoveryAction: null,
        recoveryStatus: null,
        recoveryError: null,
      },
      dryRun
    );
  }

  const comparison = compare(session, provider);
  if (
    comparison.differenceType === "provider_paid_local_unpaid" &&
    comparison.recoveryStatus === "ready"
  ) {
    if (dryRun) {
      comparison.result = "manual_review";
      comparison.recoveryStatus = "dry_run";
    } else {
      try {
        const completed = await completePayment(
          {
            paymentSessionId: session.id,
            providerTransactionId: provider.tradeNo ?? "",
            amount: provider.amount ?? session.localAmount,
            currency: provider.currency ?? session.currency,
            paidAt: provider.paidAt,
            source: "reconciliation",
          },
          supabase
        );
        comparison.result = "resolved";
        comparison.errorCode = null;
        comparison.errorMessage = completed.deliveryError ?? null;
        comparison.recoveryAction = "complete_payment";
        comparison.recoveryStatus = completed.deliveryError ? "paid_delivery_failed" : "success";
        comparison.recoveryError = completed.deliveryError ?? null;
      } catch (error) {
        comparison.result = "manual_review";
        comparison.errorCode = "auto_recovery_failed";
        comparison.errorMessage = "渠道已支付，但自动恢复失败，已转入人工复核。";
        comparison.recoveryStatus = "failed";
        comparison.recoveryError = getSafeErrorMessage(error, "自动恢复失败");
      }
    }
  }

  return record(supabase, session, provider, comparison, dryRun);
}

function compare(session: PaymentSession, provider: ProviderSummary): ReconciliationComparison {
  if (provider.status === "not_found") {
    return issue("manual_review", "provider_not_found", "provider_not_found", "渠道支付单不存在，需要人工核查。");
  }
  if (provider.status === "paid" && session.localStatus !== "paid") {
    if ((provider.currency ?? session.currency).toUpperCase() !== session.currency.toUpperCase()) {
      return issue("manual_review", "currency_mismatch", "currency_mismatch", "渠道币种与本站币种不一致。");
    }
    if (!amountEqual(session.localAmount, provider.amount, session.currency)) {
      return issue("manual_review", "amount_mismatch", "amount_mismatch", "渠道金额与本站应付金额不一致。");
    }
    if (session.localTradeNo && provider.tradeNo && session.localTradeNo !== provider.tradeNo) {
      return issue(
        "manual_review",
        "transaction_id_conflict",
        "transaction_id_conflict",
        "渠道交易号与本站记录不一致。"
      );
    }
    if (!provider.tradeNo) {
      return issue(
        "manual_review",
        "transaction_id_conflict",
        "provider_transaction_missing",
        "渠道未返回可信交易号，不能自动恢复。"
      );
    }
    return {
      result: "mismatched",
      differenceType: "provider_paid_local_unpaid",
      errorCode: "provider_paid_local_unpaid",
      errorMessage: "渠道已支付，准备调用统一支付完成服务。",
      recoveryAction: "complete_payment",
      recoveryStatus: "ready",
      recoveryError: null,
    };
  }
  if (session.localStatus === "paid" && provider.status !== "paid") {
    return issue(
      "manual_review",
      "local_paid_provider_unpaid",
      "high_risk_status_mismatch",
      "本站已支付但渠道未支付，不自动回滚。"
    );
  }
  if ((provider.currency ?? session.currency).toUpperCase() !== session.currency.toUpperCase()) {
    return issue("manual_review", "currency_mismatch", "currency_mismatch", "本站币种与渠道币种不一致。");
  }
  if (!amountEqual(session.localAmount, provider.amount, session.currency)) {
    return issue("manual_review", "amount_mismatch", "amount_mismatch", "本站金额与渠道金额不一致。");
  }
  if (["pending", "processing"].includes(provider.status) || ["pending", "processing"].includes(session.localStatus)) {
    return clear("pending");
  }
  if (session.localStatus !== provider.status) {
    return issue("mismatched", "status_mismatch", "status_mismatch", "本站支付状态与渠道状态不一致。");
  }
  return clear("matched");
}

async function queryProvider(session: PaymentSession): Promise<ProviderSummary> {
  if (!session.provider) throw new PaymentProviderError("支付渠道 Provider 未配置");
  const result = await getPaymentProvider(session.provider).queryPayment(
    session.providerOrderNo ?? session.sessionNo
  );
  const raw = result as {
    status?: unknown;
    amount?: unknown;
    currency?: unknown;
    providerTransactionId?: unknown;
    providerTradeNo?: unknown;
    tradeNo?: unknown;
    paidAt?: unknown;
  };
  const rawStatus = text(raw.status);
  return {
    status: normalizeProviderStatus(raw.status),
    amount: raw.amount == null ? null : number(raw.amount),
    currency: text(raw.currency),
    tradeNo:
      text(raw.providerTransactionId) ?? text(raw.providerTradeNo) ?? text(raw.tradeNo),
    paidAt: text(raw.paidAt),
    rawStatus,
  };
}

async function readSession(
  supabase: SupabaseClient,
  id: string,
  businessType?: "order" | "recharge"
) {
  let query = supabase.from("payment_sessions").select(SESSION_SELECT).eq("id", id);
  if (businessType) query = query.eq("business_type", businessType);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? normalizeSession(data as Record<string, unknown>) : null;
}

async function listSessions(
  supabase: SupabaseClient,
  limit: number,
  businessType?: "order" | "recharge"
) {
  let query = supabase
    .from("payment_sessions")
    .select(SESSION_SELECT)
    .in("status", ["pending", "processing", "paid", "failed"])
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (businessType) query = query.eq("business_type", businessType);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeSession);
}

function normalizeSession(row: Record<string, unknown>): PaymentSession {
  return {
    id: String(row.id),
    sessionNo: String(row.session_no),
    businessType: row.business_type === "order" ? "order" : "recharge",
    businessId: String(row.business_id),
    businessNo: text(row.business_no),
    channelCode: String(row.channel_code ?? ""),
    provider: text(row.provider) as PaymentProviderCode | null,
    providerOrderNo: text(row.provider_order_no),
    localStatus: normalizeProviderPaymentStatus(row.status),
    localAmount: number(row.payable_amount),
    currency: String(row.currency ?? "CNY"),
    localTradeNo: text(row.provider_transaction_id),
    updatedAt: text(row.updated_at),
    createdAt: text(row.created_at),
  };
}

async function record(
  supabase: SupabaseClient,
  session: PaymentSession,
  provider: ProviderSummary,
  comparison: ReconciliationComparison,
  dryRun: boolean
) {
  const checkedAt = new Date().toISOString();
  const dedupeKey = [
    session.id,
    session.updatedAt ?? session.createdAt ?? "none",
    session.localStatus,
    provider.status,
    provider.amount ?? "none",
    provider.currency ?? session.currency,
    provider.tradeNo ?? "none",
    comparison.result,
    comparison.differenceType ?? "none",
  ].join(":");
  const row = {
    reconciliation_no: reconciliationNo(),
    payment_session_id: session.id,
    business_type: session.businessType,
    business_id: session.businessNo ?? session.businessId,
    channel_code: session.channelCode,
    provider: session.provider,
    local_status: session.localStatus,
    provider_status: provider.status,
    local_amount: round(session.localAmount, session.currency),
    provider_amount:
      provider.amount == null ? null : round(provider.amount, provider.currency ?? session.currency),
    currency: session.currency,
    result: comparison.result,
    difference_type: comparison.differenceType,
    error_code: comparison.errorCode,
    error_message: comparison.errorMessage,
    checked_at: checkedAt,
    resolved_at: comparison.result === "resolved" ? checkedAt : null,
    resolution: comparison.result === "resolved" ? "统一支付完成服务自动恢复" : null,
    risk_level: risk(comparison.result, comparison.differenceType),
    provider_trade_no: provider.tradeNo,
    local_trade_no: session.localTradeNo,
    provider_summary: safeSummary(provider),
    recovery_action: comparison.recoveryAction,
    recovery_status: dryRun && comparison.recoveryAction ? "dry_run" : comparison.recoveryStatus,
    recovery_error: comparison.recoveryError,
    dedupe_key: dedupeKey,
  };
  if (dryRun) {
    return normalizeReconciliationRow({
      id: "dry-run",
      created_at: checkedAt,
      updated_at: checkedAt,
      ...row,
    });
  }
  const { data, error } = await supabase
    .from("payment_reconciliations")
    .upsert(row, { onConflict: "dedupe_key" })
    .select("*")
    .single();
  if (error) throw error;
  return normalizeReconciliationRow(data as Record<string, unknown>);
}

function issue(
  result: ReconciliationResult,
  differenceType: ReconciliationDifferenceType,
  errorCode: string,
  errorMessage: string
): ReconciliationComparison {
  return {
    result,
    differenceType,
    errorCode,
    errorMessage,
    recoveryAction: null,
    recoveryStatus: null,
    recoveryError: null,
  };
}

function clear(result: ReconciliationResult): ReconciliationComparison {
  return {
    result,
    differenceType: null,
    errorCode: null,
    errorMessage: null,
    recoveryAction: null,
    recoveryStatus: null,
    recoveryError: null,
  };
}

function emptyProvider(): ProviderSummary {
  return {
    status: "processing",
    amount: null,
    currency: null,
    tradeNo: null,
    paidAt: null,
    rawStatus: null,
  };
}

function safeSummary(provider: ProviderSummary) {
  return {
    status: provider.status,
    rawStatus: provider.rawStatus,
    amount: provider.amount,
    currency: provider.currency,
    tradeNoMasked: provider.tradeNo ? mask(provider.tradeNo) : null,
    paidAt: provider.paidAt,
  };
}

function risk(result: ReconciliationResult, difference: ReconciliationDifferenceType | null) {
  if (
    difference === "local_paid_provider_unpaid" ||
    difference === "transaction_id_conflict" ||
    difference === "amount_mismatch" ||
    difference === "currency_mismatch"
  ) {
    return "high";
  }
  if (result === "query_failed" || result === "mismatched" || result === "manual_review") {
    return "medium";
  }
  return "normal";
}

function reconciliationNo() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `REC${stamp}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function amountEqual(local: number, provider: number | null, currency: string) {
  return provider == null || round(local, currency) === round(provider, currency);
}

function round(value: number, currency: string) {
  const factor = currency.toUpperCase() === "USDT" ? 1_000_000 : 100;
  return Math.round(value * factor) / factor;
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mask(value: string) {
  return value.length <= 8 ? "****" : `${value.slice(0, 4)}****${value.slice(-4)}`;
}
