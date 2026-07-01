import "server-only";

import { createHash, randomUUID } from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export type RiskBusinessType = "account" | "login" | "order" | "inventory" | "payment" | "recharge" | "refund" | "delivery";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type RiskAction = "allow" | "allow_with_monitoring" | "require_review" | "temporarily_block" | "deny";

export type RiskRuleCode =
  | "ACCOUNT_RECENTLY_CREATED_HIGH_VALUE"
  | "ACCOUNT_RESTRICTED_HIGH_RISK_ACTION"
  | "ORDER_UNPAID_BURST"
  | "ORDER_LARGE_QUANTITY"
  | "ORDER_SKU_REPEATED_RESERVATION"
  | "PAYMENT_SESSION_BURST"
  | "PAYMENT_CHANNEL_SWITCHING"
  | "PAYMENT_DUPLICATE_PROVIDER_TRADE"
  | "RECHARGE_REQUEST_BURST"
  | "RECHARGE_DUPLICATE_CLIENT_REQUEST"
  | "REFUND_REQUEST_BURST"
  | "REFUND_RATIO_HIGH"
  | "REFUND_DELIVERED_DIGITAL"
  | "SOURCE_SHARED_BY_ACCOUNTS";

export type RiskEvaluationInput = {
  supabase: SupabaseClient;
  request?: Request;
  userId?: string | null;
  businessType: RiskBusinessType;
  businessId?: string | null;
  requestId?: string | null;
  accountCreatedAt?: string | null;
  orderAmount?: number | null;
  currency?: string | null;
  paymentChannel?: string | null;
  productId?: string | null;
  skuId?: string | null;
  quantity?: number | null;
  riskContext?: Record<string, unknown>;
  failClosed?: boolean;
};

export type RiskRuleHit = {
  rule_code: RiskRuleCode;
  weight: number;
  window_seconds: number;
  threshold: number;
  summary: string;
};

export type RiskEvaluationResult = {
  risk_level: RiskLevel;
  risk_score: number;
  matched_rules: RiskRuleHit[];
  recommended_action: RiskAction;
  review_required: boolean;
  expires_at: string | null;
  event_id?: string | null;
  request_id: string;
};

type CountQuery = {
  table: string;
  userId?: string | null;
  column?: string;
  value?: string | null;
  statuses?: string[];
  createdColumn?: string;
  windowSeconds: number;
};

export const RISK_RULES: Record<RiskRuleCode, Omit<RiskRuleHit, "summary"> & { enabled: boolean }> = {
  ACCOUNT_RECENTLY_CREATED_HIGH_VALUE: { rule_code: "ACCOUNT_RECENTLY_CREATED_HIGH_VALUE", enabled: true, weight: 35, window_seconds: 86400, threshold: 1 },
  ACCOUNT_RESTRICTED_HIGH_RISK_ACTION: { rule_code: "ACCOUNT_RESTRICTED_HIGH_RISK_ACTION", enabled: true, weight: 70, window_seconds: 300, threshold: 1 },
  ORDER_UNPAID_BURST: { rule_code: "ORDER_UNPAID_BURST", enabled: true, weight: 35, window_seconds: 900, threshold: 5 },
  ORDER_LARGE_QUANTITY: { rule_code: "ORDER_LARGE_QUANTITY", enabled: true, weight: 30, window_seconds: 300, threshold: 50 },
  ORDER_SKU_REPEATED_RESERVATION: { rule_code: "ORDER_SKU_REPEATED_RESERVATION", enabled: true, weight: 30, window_seconds: 1800, threshold: 3 },
  PAYMENT_SESSION_BURST: { rule_code: "PAYMENT_SESSION_BURST", enabled: true, weight: 35, window_seconds: 900, threshold: 6 },
  PAYMENT_CHANNEL_SWITCHING: { rule_code: "PAYMENT_CHANNEL_SWITCHING", enabled: true, weight: 25, window_seconds: 1800, threshold: 3 },
  PAYMENT_DUPLICATE_PROVIDER_TRADE: { rule_code: "PAYMENT_DUPLICATE_PROVIDER_TRADE", enabled: true, weight: 95, window_seconds: 86400, threshold: 1 },
  RECHARGE_REQUEST_BURST: { rule_code: "RECHARGE_REQUEST_BURST", enabled: true, weight: 35, window_seconds: 1800, threshold: 5 },
  RECHARGE_DUPLICATE_CLIENT_REQUEST: { rule_code: "RECHARGE_DUPLICATE_CLIENT_REQUEST", enabled: true, weight: 45, window_seconds: 86400, threshold: 1 },
  REFUND_REQUEST_BURST: { rule_code: "REFUND_REQUEST_BURST", enabled: true, weight: 40, window_seconds: 86400, threshold: 3 },
  REFUND_RATIO_HIGH: { rule_code: "REFUND_RATIO_HIGH", enabled: true, weight: 35, window_seconds: 2592000, threshold: 1 },
  REFUND_DELIVERED_DIGITAL: { rule_code: "REFUND_DELIVERED_DIGITAL", enabled: true, weight: 30, window_seconds: 2592000, threshold: 1 },
  SOURCE_SHARED_BY_ACCOUNTS: { rule_code: "SOURCE_SHARED_BY_ACCOUNTS", enabled: true, weight: 20, window_seconds: 86400, threshold: 3 },
};

export async function evaluateRisk(input: RiskEvaluationInput): Promise<RiskEvaluationResult> {
  const requestId = normalizeRequestId(input.requestId);
  try {
    const matchedRules = await matchRiskRules(input);
    const riskScore = Math.min(100, matchedRules.reduce((sum, rule) => sum + rule.weight, 0));
    const riskLevel = scoreToLevel(riskScore, matchedRules);
    const recommendedAction = actionForLevel(riskLevel, input.businessType);
    const result: RiskEvaluationResult = {
      risk_level: riskLevel,
      risk_score: riskScore,
      matched_rules: matchedRules,
      recommended_action: recommendedAction,
      review_required: recommendedAction === "require_review",
      expires_at: ["temporarily_block", "require_review"].includes(recommendedAction)
        ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
        : null,
      request_id: requestId,
    };

    if (matchedRules.length > 0) {
      const event = await recordRiskEvent(input.supabase, {
        ...result,
        request_id: requestId,
        business_type: input.businessType,
        business_id: input.businessId ?? null,
        user_id: input.userId ?? null,
        source_hash: buildSourceHash(input.request),
        summary: matchedRules.map((rule) => rule.summary).join("; "),
        metadata: sanitizeRiskMetadata(input.riskContext),
      });
      result.event_id = event.eventId;
    }

    return result;
  } catch {
    if (input.failClosed) {
      return {
        risk_level: "high",
        risk_score: 80,
        matched_rules: [{ ...RISK_RULES.ACCOUNT_RESTRICTED_HIGH_RISK_ACTION, summary: "风险服务异常，高风险业务进入人工审核" }],
        recommended_action: "require_review",
        review_required: true,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        request_id: requestId,
      };
    }
    return {
      risk_level: "low",
      risk_score: 0,
      matched_rules: [],
      recommended_action: "allow_with_monitoring",
      review_required: false,
      expires_at: null,
      request_id: requestId,
    };
  }
}

export function evaluateOrderRisk(input: Omit<RiskEvaluationInput, "businessType">) {
  return evaluateRisk({ ...input, businessType: "order", failClosed: true });
}

export function evaluatePaymentRisk(input: Omit<RiskEvaluationInput, "businessType">) {
  return evaluateRisk({ ...input, businessType: "payment", failClosed: true });
}

export function evaluateRechargeRisk(input: Omit<RiskEvaluationInput, "businessType">) {
  return evaluateRisk({ ...input, businessType: "recharge", failClosed: true });
}

export function evaluateRefundRisk(input: Omit<RiskEvaluationInput, "businessType">) {
  return evaluateRisk({ ...input, businessType: "refund", failClosed: true });
}

export function shouldBlockRisk(result: RiskEvaluationResult) {
  if (result.recommended_action === "deny") return "当前操作命中高风险规则，已被拒绝，请联系客服处理。";
}

export function riskResponseMessage(result: RiskEvaluationResult) {
  if (result.recommended_action === "deny") return "当前操作命中高风险规则，已被拒绝，请联系客服处理。";
  if (result.recommended_action === "temporarily_block") return "当前操作过于频繁，已临时限制，请稍后再试或联系管理员审核。";
  if (result.recommended_action === "require_review") return "当前操作需要管理员人工审核，请稍后查看处理结果。";
  return "风险检查已记录。";
}

async function matchRiskRules(input: RiskEvaluationInput): Promise<RiskRuleHit[]> {
  const hits: RiskRuleHit[] = [];
  const quantity = finiteNumber(input.quantity);
  const amount = finiteNumber(input.orderAmount);
  const accountAgeSeconds = input.accountCreatedAt
    ? Math.max(0, (Date.now() - new Date(input.accountCreatedAt).getTime()) / 1000)
    : null;

  if (input.userId) {
    const profile = await loadProfile(input.supabase, input.userId);
    if (profile?.risk_status && ["high_risk", "blocked"].includes(profile.risk_status)) {
      addHit(hits, "ACCOUNT_RESTRICTED_HIGH_RISK_ACTION", "受限账户继续调用高风险接口");
    }
  }

  if (amount >= 1000 && accountAgeSeconds != null && accountAgeSeconds < RISK_RULES.ACCOUNT_RECENTLY_CREATED_HIGH_VALUE.window_seconds) {
    addHit(hits, "ACCOUNT_RECENTLY_CREATED_HIGH_VALUE", "鏂拌处鎴风珛鍗冲彂璧烽珮閲戦鎿嶄綔");
  }

  if (input.businessType === "order") {
    if (quantity >= RISK_RULES.ORDER_LARGE_QUANTITY.threshold) addHit(hits, "ORDER_LARGE_QUANTITY", "异常大数量下单");
    const unpaid = await boundedCount(input.supabase, {
      table: "orders",
      userId: input.userId,
      statuses: ["pending_payment"],
      windowSeconds: RISK_RULES.ORDER_UNPAID_BURST.window_seconds,
    });
    if (unpaid >= RISK_RULES.ORDER_UNPAID_BURST.threshold) addHit(hits, "ORDER_UNPAID_BURST", "鐭椂闂村垱寤哄ぇ閲忔湭鏀粯璁㈠崟");

    if (input.skuId) {
      const skuCount = await boundedCount(input.supabase, {
        table: "order_items",
        column: "sku_id",
        value: input.skuId,
        windowSeconds: RISK_RULES.ORDER_SKU_REPEATED_RESERVATION.window_seconds,
      });
      if (skuCount >= RISK_RULES.ORDER_SKU_REPEATED_RESERVATION.threshold) addHit(hits, "ORDER_SKU_REPEATED_RESERVATION", "同一 SKU 被重复预留");
    }
  }

  if (input.businessType === "payment") {
    const sessions = await boundedCount(input.supabase, {
      table: "payment_sessions",
      userId: input.userId,
      windowSeconds: RISK_RULES.PAYMENT_SESSION_BURST.window_seconds,
    });
    if (sessions >= RISK_RULES.PAYMENT_SESSION_BURST.threshold) addHit(hits, "PAYMENT_SESSION_BURST", "棰戠箒鍒涘缓鏀粯浼氳瘽");
  }

  if (input.businessType === "recharge") {
    const recharges = await boundedCount(input.supabase, {
      table: "account_recharges",
      userId: input.userId,
      statuses: ["pending", "processing"],
      windowSeconds: RISK_RULES.RECHARGE_REQUEST_BURST.window_seconds,
    });
    if (recharges >= RISK_RULES.RECHARGE_REQUEST_BURST.threshold) addHit(hits, "RECHARGE_REQUEST_BURST", "短时间大量充值申请");
  }

  if (input.businessType === "refund") {
    const refunds = await boundedCount(input.supabase, {
      table: "refund_requests",
      userId: input.userId,
      windowSeconds: RISK_RULES.REFUND_REQUEST_BURST.window_seconds,
    });
    if (refunds >= RISK_RULES.REFUND_REQUEST_BURST.threshold) addHit(hits, "REFUND_REQUEST_BURST", "短时间多次退款申请");
    if (input.riskContext?.deliveryDelivered === true) addHit(hits, "REFUND_DELIVERED_DIGITAL", "已交付数字商品申请退款");
  }

  return hits;
}

async function boundedCount(supabase: SupabaseClient, query: CountQuery) {
  const createdColumn = query.createdColumn ?? "created_at";
  let builder = supabase
    .from(query.table)
    .select("id", { count: "exact", head: true })
    .gte(createdColumn, new Date(Date.now() - query.windowSeconds * 1000).toISOString());
  if (query.userId) builder = builder.eq("user_id", query.userId);
  if (query.column && query.value) builder = builder.eq(query.column, query.value);
  if (query.statuses?.length) builder = builder.in("status", query.statuses);
  const { count, error } = await builder.limit(500);
  if (error) return 0;
  return Math.min(count ?? 0, 500);
}

async function loadProfile(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,risk_status,account_status,created_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) return null;
  return data as { risk_status?: string | null; account_status?: string | null; created_at?: string | null } | null;
}

function addHit(hits: RiskRuleHit[], code: RiskRuleCode, summary: string) {
  const rule = RISK_RULES[code];
  if (!rule.enabled) return;
  hits.push({ rule_code: code, weight: rule.weight, window_seconds: rule.window_seconds, threshold: rule.threshold, summary });
}

function scoreToLevel(score: number, hits: RiskRuleHit[]): RiskLevel {
  if (hits.some((hit) => hit.rule_code === "PAYMENT_DUPLICATE_PROVIDER_TRADE")) return "critical";
  if (score >= 80) return "critical";
  if (score >= 55) return "high";
  if (score >= 25) return "medium";
  return "low";
}

function actionForLevel(level: RiskLevel, businessType: RiskBusinessType): RiskAction {
  if (level === "critical") return "deny";
  if (level === "high") return ["refund", "delivery"].includes(businessType) ? "require_review" : "temporarily_block";
  if (level === "medium") return "allow_with_monitoring";
  return "allow";
}

export async function recordRiskEvent(
  supabase: SupabaseClient,
  input: RiskEvaluationResult & {
    business_type: RiskBusinessType;
    business_id: string | null;
    user_id: string | null;
    source_hash: string | null;
    summary: string;
    metadata: Record<string, unknown>;
  }
) {
  const writer = getSupabaseServiceRoleClient() ?? supabase;
  const fingerprint = createHash("sha256")
    .update([input.user_id ?? "anonymous", input.business_type, input.business_id ?? "none", input.matched_rules.map((rule) => rule.rule_code).sort().join(",")].join("|"))
    .digest("hex");
  const primaryRule = input.matched_rules[0]?.rule_code ?? "SOURCE_SHARED_BY_ACCOUNTS";
  const row = {
    fingerprint,
    rule_code: primaryRule,
    risk_level: input.risk_level,
    risk_score: input.risk_score,
    recommended_action: input.recommended_action,
    business_type: input.business_type,
    business_id: input.business_id,
    user_id: input.user_id,
    request_id: input.request_id,
    source_hash: input.source_hash,
    summary: input.summary.slice(0, 500),
    metadata: input.metadata,
    status: input.review_required ? "pending" : "open",
    expires_at: input.expires_at,
    last_seen_at: new Date().toISOString(),
  };

  const { data, error } = await writer
    .from("risk_events")
    .upsert(row, { onConflict: "fingerprint" })
    .select("id")
    .maybeSingle();

  if (error) {
    if (isRiskSchemaMissing(error)) return { ok: false as const, eventId: null, schemaMissing: true };
    throw error;
  }

  return { ok: true as const, eventId: typeof data?.id === "string" ? data.id : null, schemaMissing: false };
}

export function buildSourceHash(request?: Request) {
  if (!request) return null;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const ua = request.headers.get("user-agent") ?? "";
  const seed = `${forwarded.slice(0, 64)}|${summarizeUserAgent(ua)}`;
  return createHash("sha256").update(seed).digest("hex");
}

export function summarizeUserAgent(value: string | null) {
  if (!value) return null;
  return value.replace(/\s+/g, " ").slice(0, 120);
}

function sanitizeRiskMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (/password|token|secret|key|authorization|cookie|content|callback|payload/i.test(key)) continue;
    if (typeof raw === "string") output[key] = raw.slice(0, 160);
    else if (typeof raw === "number" || typeof raw === "boolean" || raw == null) output[key] = raw;
  }
  return output;
}

export function normalizeRequestId(value?: string | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.length <= 160 ? text : randomUUID();
}

function finiteNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isRiskSchemaMissing(error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message ?? "") : String(error ?? "");
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return /risk_events|risk_reviews|schema cache|Could not find the table/i.test(message) || ["42P01", "42703", "PGRST205"].includes(code);
}

