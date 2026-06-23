import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getPaymentProvider, PaymentProviderError } from "@/lib/payments/providers";
import type { PaymentProviderCode } from "@/lib/payments/channel-types";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const RECONCILIATION_RESULTS = ["matched", "mismatched", "pending", "query_failed", "manual_review", "resolved"] as const;
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
  businessType: "order" | "recharge";
  businessId: string | null;
  paymentNo: string;
  channelCode: string | null;
  provider: PaymentProviderCode | null;
  localStatus: string;
  localAmount: number;
  currency: string;
  localTradeNo: string | null;
  updatedAt: string | null;
  createdAt: string | null;
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
type ProviderSummary = {
  status: string | null;
  amount: number | null;
  currency: string | null;
  tradeNo: string | null;
  paidAt: string | null;
  merchantId: string | null;
  rawStatus: string | null;
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

const PAYMENT_SELECT = "id,payment_no,status,channel,payment_method,provider_trade_no,transaction_reference,payable_amount,amount,currency,business_type,order_id,updated_at,created_at,orders(order_no)";
const RECHARGE_SELECT = "id,recharge_no,status,channel,channel_code,provider,provider_trade_no,payable_amount,amount,currency,updated_at,created_at";
const CHANNEL_SELECT = "channel,code,enabled,provider,provider_name,api_url,merchant_id";

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function status(value: unknown) {
  const next = String(value ?? "pending").toLowerCase();
  if (next === "submitted" || next === "under_review") return "processing";
  if (next === "rejected" || next === "cancelled") return "closed";
  return next;
}

export function normalizeProviderStatus(value: unknown) {
  const next = String(value ?? "").toLowerCase();
  if (["success", "succeeded", "completed", "confirmed", "paid"].includes(next)) return "paid";
  if (["created", "waiting", "unpaid", "pending"].includes(next)) return "pending";
  if (["processing", "confirming"].includes(next)) return "processing";
  if (["expired", "timeout"].includes(next)) return "expired";
  if (["closed", "cancelled", "canceled"].includes(next)) return "closed";
  if (["failed", "error"].includes(next)) return "failed";
  if (["not_found", "missing"].includes(next)) return "not_found";
  return next || "unknown";
}

function round(value: number, currency: string) {
  const scale = currency.toUpperCase() === "USDT" ? 6 : 2;
  const factor = 10 ** scale;
  return Math.round(value * factor) / factor;
}

function amountEqual(local: number, provider: number | null, currency: string) {
  return provider === null || round(local, currency) === round(provider, currency);
}

function risk(result: ReconciliationResult, difference: ReconciliationDifferenceType | null) {
  if (difference === "local_paid_provider_unpaid" || difference === "transaction_id_conflict") return "high";
  if (result === "manual_review" || difference === "provider_paid_local_unpaid" || difference === "amount_mismatch" || difference === "currency_mismatch") return "high";
  if (result === "query_failed" || result === "mismatched") return "medium";
  return "normal";
}

function reconciliationNo() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `REC${stamp}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function mask(value: string) {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function safeSummary(provider: ProviderSummary) {
  return {
    status: provider.status,
    rawStatus: provider.rawStatus,
    amount: provider.amount,
    currency: provider.currency,
    tradeNoMasked: provider.tradeNo ? mask(provider.tradeNo) : null,
    paidAt: provider.paidAt,
    merchantMatched: Boolean(provider.merchantId),
  };
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
    local_amount: num(row.local_amount),
    provider_amount: row.provider_amount === null || row.provider_amount === undefined ? null : num(row.provider_amount),
    currency: String(row.currency ?? "CNY"),
    result: RECONCILIATION_RESULTS.includes(row.result as ReconciliationResult) ? (row.result as ReconciliationResult) : "pending",
    difference_type: RECONCILIATION_DIFFERENCE_TYPES.includes(row.difference_type as ReconciliationDifferenceType) ? (row.difference_type as ReconciliationDifferenceType) : null,
    error_code: text(row.error_code),
    error_message: text(row.error_message),
    checked_at: String(row.checked_at ?? ""),
    resolved_at: text(row.resolved_at),
    resolution: text(row.resolution),
    risk_level: row.risk_level === "high" || row.risk_level === "medium" ? row.risk_level : "normal",
    provider_trade_no: text(row.provider_trade_no),
    local_trade_no: text(row.local_trade_no),
    provider_summary: row.provider_summary && typeof row.provider_summary === "object" ? (row.provider_summary as Record<string, unknown>) : {},
    recovery_action: text(row.recovery_action),
    recovery_status: text(row.recovery_status),
    recovery_error: text(row.recovery_error),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? row.created_at ?? ""),
  };
}

function schemaMissing(error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message ?? "") : String(error ?? "");
  return /payment_reconciliations|schema cache|PGRST205|42P01|42703/i.test(message);
}

export function isReconciliationSchemaMissing(error: unknown) {
  return schemaMissing(error);
}

export function getReconciliationErrorMessage(error: unknown, fallback = "支付对账数据加载失败") {
  if (schemaMissing(error)) return "支付对账表尚未初始化，请先执行 payment reconciliation migration。";
  if (error instanceof PaymentProviderError) return error.message;
  return fallback;
}

export function normalizeReconciliationRows(rows: Record<string, unknown>[]) {
  return rows.map(normalizeReconciliationRow);
}

async function providerConfig(supabase: SupabaseClient, channelCode: string | null) {
  if (!channelCode) return null;
  const { data, error } = await supabase.from("payment_channels").select(CHANNEL_SELECT).or(`channel.eq.${channelCode},code.eq.${channelCode}`).maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    enabled: Boolean(row.enabled),
    provider: (text(row.provider) ?? text(row.provider_name)) as PaymentProviderCode | null,
    apiUrl: text(row.api_url),
  };
}

async function normalizeOrder(row: Record<string, unknown>, supabase: SupabaseClient): Promise<PaymentSession> {
  const channel = text(row.channel) ?? text(row.payment_method);
  const config = await providerConfig(supabase, channel);
  const order = row.orders && typeof row.orders === "object" ? (row.orders as Record<string, unknown>) : null;
  return {
    id: String(row.id),
    businessType: "order",
    businessId: text(order?.order_no) ?? text(row.order_id),
    paymentNo: String(row.payment_no ?? row.id),
    channelCode: channel,
    provider: config?.provider ?? null,
    localStatus: status(row.status),
    localAmount: num(row.payable_amount ?? row.amount),
    currency: String(row.currency ?? "CNY"),
    localTradeNo: text(row.provider_trade_no) ?? text(row.transaction_reference),
    updatedAt: text(row.updated_at),
    createdAt: text(row.created_at),
  };
}

async function normalizeRecharge(row: Record<string, unknown>, supabase: SupabaseClient): Promise<PaymentSession> {
  const channel = text(row.channel_code) ?? text(row.channel);
  const config = await providerConfig(supabase, channel);
  return {
    id: String(row.id),
    businessType: "recharge",
    businessId: String(row.recharge_no ?? row.id),
    paymentNo: String(row.recharge_no ?? row.id),
    channelCode: channel,
    provider: (text(row.provider) as PaymentProviderCode | null) ?? config?.provider ?? null,
    localStatus: status(row.status),
    localAmount: num(row.payable_amount ?? row.amount),
    currency: String(row.currency ?? "CNY"),
    localTradeNo: text(row.provider_trade_no),
    updatedAt: text(row.updated_at),
    createdAt: text(row.created_at),
  };
}

async function readSession(supabase: SupabaseClient, id: string, businessType?: "order" | "recharge") {
  if (businessType !== "recharge") {
    const { data, error } = await supabase.from("order_payments").select(PAYMENT_SELECT).eq("id", id).maybeSingle();
    if (error && businessType === "order") throw error;
    if (data) return normalizeOrder(data as Record<string, unknown>, supabase);
  }
  if (businessType !== "order") {
    const { data, error } = await supabase.from("account_recharges").select(RECHARGE_SELECT).eq("id", id).maybeSingle();
    if (error) throw error;
    if (data) return normalizeRecharge(data as Record<string, unknown>, supabase);
  }
  return null;
}

async function listSessions(supabase: SupabaseClient, limit: number) {
  const pendingCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const processingCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const [orders, recharges] = await Promise.all([
    supabase.from("order_payments").select(PAYMENT_SELECT).or(`and(status.in.(pending,submitted,under_review),created_at.lt.${pendingCutoff}),and(status.eq.processing,updated_at.lt.${processingCutoff}),exception_type.not.is.null`).order("created_at", { ascending: true }).limit(limit),
    supabase.from("account_recharges").select(RECHARGE_SELECT).or(`and(status.in.(pending,processing),created_at.lt.${pendingCutoff}),exception_type.not.is.null`).order("created_at", { ascending: true }).limit(limit),
  ]);
  if (orders.error) throw orders.error;
  if (recharges.error) throw recharges.error;
  const sessions: PaymentSession[] = [];
  for (const row of (orders.data ?? []) as Record<string, unknown>[]) sessions.push(await normalizeOrder(row, supabase));
  for (const row of (recharges.data ?? []) as Record<string, unknown>[]) sessions.push(await normalizeRecharge(row, supabase));
  return sessions.slice(0, limit);
}

async function queryProvider(session: PaymentSession): Promise<ProviderSummary> {
  if (!session.provider) throw new PaymentProviderError("支付渠道 Provider 未配置");
  const result = await getPaymentProvider(session.provider).queryPayment(session.paymentNo);
  const raw = result as { status?: unknown; amount?: unknown; currency?: unknown; providerTradeNo?: unknown; tradeNo?: unknown; paidAt?: unknown; merchantId?: unknown };
  return {
    status: normalizeProviderStatus(raw.status),
    amount: raw.amount === undefined ? null : num(raw.amount),
    currency: text(raw.currency),
    tradeNo: text(raw.providerTradeNo) ?? text(raw.tradeNo),
    paidAt: text(raw.paidAt),
    merchantId: text(raw.merchantId),
    rawStatus: text(raw.status),
  };
}

function compare(session: PaymentSession, provider: ProviderSummary): ReconciliationComparison {
  let result: ReconciliationResult = "matched";
  let differenceType: ReconciliationDifferenceType | null = null;
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  let recoveryAction: string | null = null;
  let recoveryStatus: string | null = null;
  let recoveryError: string | null = null;
  const providerStatus = provider.status ?? "unknown";
  const providerCurrency = provider.currency ?? session.currency;

  if (providerStatus === "not_found") {
    result = "manual_review"; differenceType = "provider_not_found"; errorCode = "provider_not_found"; errorMessage = "渠道订单不存在，需要人工核查。";
  } else if (providerStatus === "paid" && session.localStatus !== "paid") {
    if (providerCurrency !== session.currency) {
      result = "manual_review"; differenceType = "currency_mismatch"; errorCode = "currency_mismatch"; errorMessage = "渠道币种与本地币种不一致，禁止自动恢复。";
    } else if (!amountEqual(session.localAmount, provider.amount, session.currency)) {
      result = "manual_review"; differenceType = "amount_mismatch"; errorCode = "amount_mismatch"; errorMessage = "渠道金额与本地应付金额不一致，禁止自动恢复。";
    } else if (session.localTradeNo && provider.tradeNo && session.localTradeNo !== provider.tradeNo) {
      result = "manual_review"; differenceType = "transaction_id_conflict"; errorCode = "transaction_id_conflict"; errorMessage = "渠道交易号与本地记录不一致，禁止自动恢复。";
    } else {
      result = "manual_review"; differenceType = "provider_paid_local_unpaid"; errorCode = "auto_recovery_unavailable"; errorMessage = "渠道显示已支付，但本站未入账，自动恢复条件未完整接入。"; recoveryAction = session.businessType === "order" ? "needs_order_paid_service" : "needs_recharge_credit_rpc"; recoveryStatus = "blocked"; recoveryError = "未接入真实支付成功/原子入账服务，已转入人工复核。";
    }
  } else if (session.localStatus === "paid" && providerStatus !== "paid") {
    result = "manual_review"; differenceType = "local_paid_provider_unpaid"; errorCode = "high_risk_status_mismatch"; errorMessage = "本站已支付但渠道未支付，已标记高风险异常，不自动回滚。";
  } else if (providerCurrency !== session.currency) {
    result = "manual_review"; differenceType = "currency_mismatch"; errorCode = "currency_mismatch"; errorMessage = "本地币种与渠道币种不一致。";
  } else if (!amountEqual(session.localAmount, provider.amount, session.currency)) {
    result = "manual_review"; differenceType = "amount_mismatch"; errorCode = "amount_mismatch"; errorMessage = "本地金额与渠道金额不一致。";
  } else if (["pending", "processing"].includes(session.localStatus) || ["pending", "processing"].includes(providerStatus)) {
    result = "pending";
  } else if (session.localStatus !== providerStatus && providerStatus !== "unknown") {
    result = "mismatched"; differenceType = "status_mismatch"; errorCode = "status_mismatch"; errorMessage = "本地支付状态与渠道状态不一致。";
  }
  return { result, differenceType, errorCode, errorMessage, recoveryAction, recoveryStatus, recoveryError };
}

async function record(supabase: SupabaseClient, session: PaymentSession, provider: ProviderSummary, comparison: ReconciliationComparison, dryRun: boolean) {
  const providerStatus = provider.status ?? "unknown";
  const dedupeKey = [session.businessType, session.id, session.updatedAt ?? session.createdAt ?? "none", session.localStatus, providerStatus, provider.amount ?? "none", provider.currency ?? session.currency, provider.tradeNo ?? "none", comparison.result, comparison.differenceType ?? "none"].join(":");
  const row = {
    reconciliation_no: reconciliationNo(),
    payment_session_id: session.id,
    business_type: session.businessType,
    business_id: session.businessId,
    channel_code: session.channelCode,
    provider: session.provider,
    local_status: session.localStatus,
    provider_status: providerStatus,
    local_amount: round(session.localAmount, session.currency),
    provider_amount: provider.amount === null ? null : round(provider.amount, provider.currency ?? session.currency),
    currency: session.currency,
    result: comparison.result,
    difference_type: comparison.differenceType,
    error_code: comparison.errorCode,
    error_message: comparison.errorMessage,
    checked_at: new Date().toISOString(),
    risk_level: risk(comparison.result, comparison.differenceType),
    provider_trade_no: provider.tradeNo,
    local_trade_no: session.localTradeNo,
    provider_summary: safeSummary(provider),
    recovery_action: comparison.recoveryAction,
    recovery_status: dryRun && comparison.recoveryAction ? "dry_run" : comparison.recoveryStatus,
    recovery_error: comparison.recoveryError,
    dedupe_key: dedupeKey,
  };
  if (dryRun) return normalizeReconciliationRow({ id: "dry-run", created_at: row.checked_at, updated_at: row.checked_at, ...row });
  const { data, error } = await supabase.from("payment_reconciliations").upsert(row, { onConflict: "dedupe_key" }).select("*").single();
  if (error) throw new Error(schemaMissing(error) ? "支付对账记录写入失败，请确认 payment_reconciliations migration 已执行。" : "支付对账记录写入失败");
  return normalizeReconciliationRow(data as Record<string, unknown>);
}

async function queryFailed(supabase: SupabaseClient, session: PaymentSession, error: unknown, dryRun: boolean) {
  const provider: ProviderSummary = { status: null, amount: null, currency: null, tradeNo: null, paidAt: null, merchantId: null, rawStatus: null };
  return record(supabase, session, provider, {
    result: "query_failed",
    differenceType: null,
    errorCode: error instanceof PaymentProviderError ? "provider_unconfigured" : "provider_query_failed",
    errorMessage: error instanceof PaymentProviderError ? error.message : "渠道查询失败，请稍后重试。",
    recoveryAction: null,
    recoveryStatus: null,
    recoveryError: null,
  }, dryRun);
}

export async function runPaymentReconciliation(options: ReconciliationRunOptions = {}, client?: SupabaseClient): Promise<ReconciliationRunResult> {
  const supabase = client ?? getSupabaseServiceRoleClient();
  if (!supabase) throw new Error("服务端支付对账密钥未配置");
  const output: ReconciliationRunResult = { processed: 0, matched: 0, mismatched: 0, pending: 0, query_failed: 0, manual_review: 0, resolved: 0, skipped: 0, records: [], errors: [] };
  const batchSize = Math.min(100, Math.max(1, Number(options.batchSize ?? 20)));
  const sessions = options.paymentSessionId ? [await readSession(supabase, options.paymentSessionId, options.businessType)] : await listSessions(supabase, batchSize);
  for (const session of sessions) {
    if (!session) { output.skipped += 1; continue; }
    try {
      let next: ReconciliationRecord;
      try {
        const provider = await queryProvider(session);
        next = await record(supabase, session, provider, compare(session, provider), Boolean(options.dryRun));
      } catch (error) {
        next = await queryFailed(supabase, session, error, Boolean(options.dryRun));
      }
      output.processed += 1;
      output[next.result] += 1;
      output.records.push(next);
    } catch (error) {
      output.errors.push({ paymentSessionId: session.id, message: error instanceof Error ? error.message : "单笔对账处理失败" });
    }
  }
  return output;
}
