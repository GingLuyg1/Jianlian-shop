import "server-only";

import { randomUUID } from "crypto";

import {
  Bep20UnderpaymentRuntimeError,
  readBep20UnderpaymentCandidatesSafely,
  readBep20UnderpaymentConfirmations,
  settleBep20UnderpaymentCandidates,
  summarizeBep20UnderpaymentBatch,
  summarizeBep20UnderpaymentSessionId,
} from "@/lib/payments/bep20-underpayment-runtime.mjs";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

const DEFAULT_BATCH_LIMIT = 50;
const MAX_BATCH_LIMIT = 200;

export type Bep20UnderpaymentSettlementSource = "automatic_service" | "manual_admin";

export type Bep20UnderpaymentSettlementResult = {
  ok: boolean;
  code: string;
  sessionId: string;
  sessionIdSummary: string;
  orderId?: string | null;
  orderNo?: string | null;
  receivedUsdt?: string | null;
  expectedUsdt?: string | null;
  shortfallUsdt?: string | null;
  exchangeRate?: string | null;
  creditedCny?: string | null;
  settlementSource?: Bep20UnderpaymentSettlementSource | null;
  releasedNormal?: number;
  releasedSku?: number;
  releasedDigital?: number;
  idempotent?: boolean;
  message?: string;
  requestId: string;
};

type SettlementOptions = {
  source: Bep20UnderpaymentSettlementSource;
  operatorId?: string | null;
  irreversibleConfirmed: boolean;
  reason: string;
  requestId?: string | null;
};

function requireServiceClient() {
  const service = getSupabaseServiceRoleClient();
  if (!service) {
    throw new Bep20UnderpaymentRuntimeError(
      "BEP20_UNDERPAYMENT_SERVICE_ROLE_NOT_CONFIGURED",
      "服务端数据库权限未配置，无法处理欠额支付",
    );
  }
  return service;
}

function requiredConfirmations() {
  return readBep20UnderpaymentConfirmations(process.env.BSC_REQUIRED_CONFIRMATIONS);
}

export function assertBep20UnderpaymentSettlementConfigured() {
  requireServiceClient();
  return requiredConfirmations();
}

function safeLimit(value: unknown, fallback = DEFAULT_BATCH_LIMIT) {
  const parsed = Number(value);
  return Math.max(1, Math.min(Number.isFinite(parsed) ? Math.floor(parsed) : fallback, MAX_BATCH_LIMIT));
}

function readDecimal(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return value === null || value === undefined ? null : String(value);
}

function readReleaseCount(row: Record<string, unknown>, key: string) {
  const release = row.release && typeof row.release === "object"
    ? row.release as Record<string, unknown>
    : {};
  const value = Number(release[key] ?? 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function databaseErrorCode(error: { code?: unknown; message?: unknown }) {
  const message = typeof error.message === "string" ? error.message.trim() : "";
  const stableCode = message.match(/^BEP20_UNDERPAYMENT_[A-Z_]+$/)?.[0];
  if (stableCode) return stableCode;
  const code = typeof error.code === "string" ? error.code : "";
  if (/^(PGRST202|PGRST205|42P01|42883)$/.test(code)
      || /schema cache|could not find the function|does not exist/i.test(message)) {
    return code || "PGRST202";
  }
  return code || "BEP20_UNDERPAYMENT_SETTLEMENT_FAILED";
}

export async function settleBep20Underpayment(sessionId: string, options: SettlementOptions) {
  const requestId = options.requestId?.trim() || randomUUID();
  const normalizedSessionId = String(sessionId ?? "").trim();
  if (!normalizedSessionId) {
    return {
      ok: false,
      code: "SESSION_ID_REQUIRED",
      sessionId: "",
      sessionIdSummary: "",
      message: "缺少链上支付会话 ID",
      requestId,
    } satisfies Bep20UnderpaymentSettlementResult;
  }

  const service = requireServiceClient();
  const { data, error } = await service.rpc("settle_bep20_underpayment_to_wallet", {
    p_session_id: normalizedSessionId,
    p_required_confirmations: requiredConfirmations(),
    p_reason: options.reason.trim().slice(0, 500),
    p_request_id: requestId,
    p_settlement_source: options.source,
    p_operator_user_id: options.source === "manual_admin" ? options.operatorId ?? null : null,
    p_irreversible_confirmed: options.irreversibleConfirmed,
  });

  if (error) {
    return {
      ok: false,
      code: databaseErrorCode(error),
      sessionId: normalizedSessionId,
      sessionIdSummary: summarizeBep20UnderpaymentSessionId(normalizedSessionId),
      message: "欠额支付结算失败，请稍后重试",
      requestId,
    } satisfies Bep20UnderpaymentSettlementResult;
  }

  const row = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const result = String(row.result ?? "");
  const ok = result === "settled" || result === "already_settled";
  if (!ok) {
    return {
      ok: false,
      code: "BEP20_UNDERPAYMENT_RESULT_INVALID",
      sessionId: normalizedSessionId,
      sessionIdSummary: summarizeBep20UnderpaymentSessionId(normalizedSessionId),
      message: "欠额支付结算结果无效",
      requestId,
    } satisfies Bep20UnderpaymentSettlementResult;
  }

  return {
    ok: true,
    code: result.toUpperCase(),
    sessionId: normalizedSessionId,
    sessionIdSummary: summarizeBep20UnderpaymentSessionId(normalizedSessionId),
    orderId: row.order_id ? String(row.order_id) : null,
    orderNo: row.order_no ? String(row.order_no) : null,
    receivedUsdt: readDecimal(row, "received_usdt"),
    expectedUsdt: readDecimal(row, "expected_usdt"),
    shortfallUsdt: readDecimal(row, "shortfall_usdt"),
    exchangeRate: readDecimal(row, "exchange_rate"),
    creditedCny: readDecimal(row, "credited_cny"),
    settlementSource: row.settlement_source === "manual_admin" ? "manual_admin" : "automatic_service",
    releasedNormal: readReleaseCount(row, "released_normal"),
    releasedSku: readReleaseCount(row, "released_sku"),
    releasedDigital: readReleaseCount(row, "released_digital"),
    idempotent: result === "already_settled" || row.idempotent === true,
    requestId,
  } satisfies Bep20UnderpaymentSettlementResult;
}

async function listCandidates(limit: number) {
  const service = requireServiceClient();
  const { data, error } = await service.rpc("list_expirable_bep20_underpayments", {
    p_limit: safeLimit(limit),
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : [])
    .map((row) => row && typeof row === "object" ? String((row as { session_id?: unknown }).session_id ?? "") : "")
    .filter(Boolean);
}

export async function listExpirableBep20UnderpaymentsDryRun(limit = DEFAULT_BATCH_LIMIT) {
  const requestId = randomUUID();
  const readResult = await readBep20UnderpaymentCandidatesSafely(
    () => listCandidates(safeLimit(limit)),
  );
  if (readResult.ok) {
    const candidates = readResult.candidates;
    return {
      ok: true as const,
      dryRun: true as const,
      requestId,
      candidateCount: candidates.length,
      candidates: candidates.map((sessionId: string) => ({
        sessionIdSummary: summarizeBep20UnderpaymentSessionId(sessionId),
      })),
    };
  }
  return {
    ok: false as const,
    dryRun: true as const,
    requestId,
    code: readResult.code,
    message: "欠额支付候选读取失败，请检查数据库函数是否已部署",
  };
}

export async function processExpiredBep20Underpayments(limit = DEFAULT_BATCH_LIMIT, reason = "payment_timeout_underpayment") {
  const requestId = randomUUID();
  const readResult = await readBep20UnderpaymentCandidatesSafely(
    () => listCandidates(safeLimit(limit)),
  );
  if (!readResult.ok) {
    return {
      ok: false as const,
      requestId,
      processed: 0,
      skipped: 0,
      failed: 1,
      results: [{
        ok: false,
        code: "BEP20_UNDERPAYMENT_LIST_FAILED",
        sessionId: "",
        sessionIdSummary: "",
        message: "欠额支付候选读取失败，请检查数据库函数是否已部署",
        requestId,
      } satisfies Bep20UnderpaymentSettlementResult],
    };
  }
  const candidates = readResult.candidates;

  const results = await settleBep20UnderpaymentCandidates(
    candidates,
    (sessionId: string) => settleBep20Underpayment(sessionId, {
      source: "automatic_service",
      operatorId: null,
      irreversibleConfirmed: false,
      reason,
      }),
    (sessionId: string, error: unknown) => ({
        ok: false,
        code: error instanceof Bep20UnderpaymentRuntimeError
          ? error.code
          : "BEP20_UNDERPAYMENT_SETTLEMENT_THROWN",
        sessionId,
        sessionIdSummary: summarizeBep20UnderpaymentSessionId(sessionId),
        message: "欠额支付结算失败，请稍后重试",
        requestId,
      }),
  );
  const summary = summarizeBep20UnderpaymentBatch(results);

  return {
    ok: true as const,
    requestId,
    ...summary,
    results,
  };
}

export function assertBep20UnderpaymentJobAuthorized(request: Request) {
  const expected = process.env.CRON_SECRET || process.env.INTERNAL_JOB_SECRET;
  if (!expected) return { ok: false, status: 503, message: "内部任务密钥未配置" } as const;
  const provided = request.headers.get("x-internal-job-secret")
    || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided || provided !== expected) {
    return { ok: false, status: 401, message: "无权执行欠额支付结算任务" } as const;
  }
  return { ok: true } as const;
}
