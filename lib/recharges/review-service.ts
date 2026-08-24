import "server-only";

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  classifyPostRpcStatus,
  classifyUnknownRechargeCreditOutcome,
  classifyApproveProgress,
  buildRechargeReviewErrorContract,
  executeAuditedRechargeTransition,
  executeCreditFailureTransition,
  executePaidCompletionRepair,
  executeRechargeCreditAttempt,
  getRechargeReviewActionContract,
} from "@/lib/recharges/review-workflow.mjs";
import { executeRechargeWriteCas } from "@/lib/recharges/review-adapter.mjs";
import { parseRechargeStatusStrict } from "@/lib/recharges/status-machine";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { queueRechargeSuccessEmailBestEffort } from "@/lib/email/recharge-success";

export type RechargeReviewAction =
  | "start_review"
  | "approve"
  | "reject"
  | "request_more_proof"
  | "cancel"
  | "retry_credit";

type ReviewInput = {
  rechargeId: string;
  action: RechargeReviewAction;
  adminId: string;
  reason: string;
  requestId?: string;
};

type RechargeReviewRow = {
  id: string;
  recharge_no: string;
  channel: string | null;
  channel_code: string | null;
  status: string;
  amount: number | string;
  payable_amount: number | string | null;
  currency: string | null;
  settlement_currency: string | null;
  actual_received_usdt: number | string | null;
  locked_settlement_rate: number | string | null;
  transaction_reference: string | null;
  provider_trade_no: string | null;
  approved_at: string | null;
  paid_at: string | null;
  completed_at: string | null;
  [key: string]: unknown;
};

type ParsedRechargeCreditRpcSuccess = {
  kind: "success";
  alreadyCompleted: boolean;
  rechargeNo: string;
  transactionNo: string | null;
};

type RechargeReviewOutcome =
  | "completed"
  | "idempotent"
  | "conflict"
  | "failed"
  | "partial_success"
  | "uncertain";

export type RechargeReviewResult = {
  recharge: RechargeReviewRow;
  code: "RECHARGE_REVIEW_UPDATED" | "RECHARGE_REVIEW_COMPLETED";
  safeMessage: string;
  idempotent: boolean;
  requestId: string;
  outcome: "completed" | "idempotent";
  requiresManualReconciliation: false;
};

export class RechargeReviewError extends Error {
  readonly code: string;
  readonly status: number;
  readonly outcome: RechargeReviewOutcome;
  readonly requiresManualReconciliation: boolean;
  readonly idempotent: boolean;
  readonly knownStatus: string | null;

  constructor(input: {
    message: string;
    code: string;
    status: number;
    outcome: RechargeReviewOutcome;
    requiresManualReconciliation?: boolean;
    idempotent?: boolean;
    knownStatus?: string | null;
  }) {
    super(input.message);
    this.name = new.target.name;
    this.code = input.code;
    this.status = input.status;
    this.outcome = input.outcome;
    this.requiresManualReconciliation =
      input.requiresManualReconciliation === true;
    this.idempotent = input.idempotent === true;
    this.knownStatus = input.knownStatus ?? null;
  }
}

export class RechargeReviewConflictError extends RechargeReviewError {
  constructor(message = "充值状态已发生变化，请刷新后重新核对。") {
    super({
      message,
      code: "RECHARGE_REVIEW_CONFLICT",
      status: 409,
      outcome: "conflict",
    });
  }
}

export class RechargeReviewAuditError extends RechargeReviewError {
  constructor(partialSuccess: boolean, knownStatus: string | null = null) {
    super({
      message: partialSuccess
        ? "充值状态可能已经改变，但审核事件写入失败。请按诊断编号人工核对，不得重复操作或入账。"
        : "充值审核意图记录失败，操作已停止，未继续改变状态或调用入账。",
      code: partialSuccess
        ? "RECHARGE_REVIEW_AUDIT_PARTIAL"
        : "RECHARGE_REVIEW_AUDIT_REQUIRED",
      status: 409,
      outcome: partialSuccess ? "partial_success" : "failed",
      requiresManualReconciliation: partialSuccess,
      knownStatus,
    });
  }
}

export class RechargeReviewUncertainOutcomeError extends RechargeReviewError {
  constructor(knownStatus: string | null = null) {
    super({
      message: knownStatus === "succeeded"
        ? "充值当前显示为已完成，但无法确认本请求是否执行了最终状态更新，completion 审计可能缺失。请使用诊断编号人工核对充值状态和审计记录，禁止重复入账、重复修复或补写成功事件。"
        : "充值处理结果无法确认。请人工核对充值记录、余额流水和账户余额，不得重复入账。",
      code: "RECHARGE_REVIEW_OUTCOME_UNCERTAIN",
      status: 409,
      outcome: "uncertain",
      requiresManualReconciliation: true,
      knownStatus,
    });
  }
}

export class RechargeReviewPartialSuccessError extends RechargeReviewError {
  constructor(knownStatus = "approved") {
    super({
      message: "审核通过状态已经写入，但后续入账阶段未完成。请刷新记录并按诊断编号人工核对；不得再次执行审核通过。仅在确认仍为 approved 后，才可单独重试入账。",
      code: "RECHARGE_REVIEW_PARTIAL_SUCCESS",
      status: 409,
      outcome: "partial_success",
      requiresManualReconciliation: true,
      knownStatus,
    });
  }
}

class RechargeReviewValidationError extends RechargeReviewError {
  constructor(message: string) {
    super({
      message,
      code: "RECHARGE_REVIEW_INVALID",
      status: 400,
      outcome: "failed",
    });
  }
}

class RechargeReviewNotFoundError extends RechargeReviewError {
  constructor() {
    super({
      message: "充值申请不存在。",
      code: "RECHARGE_REVIEW_NOT_FOUND",
      status: 404,
      outcome: "failed",
    });
  }
}

class RechargeReviewUnavailableError extends RechargeReviewError {
  constructor(message = "充值审核服务暂时不可用，请稍后再试。") {
    super({
      message,
      code: "RECHARGE_REVIEW_UNAVAILABLE",
      status: 503,
      outcome: "failed",
    });
  }
}

class RechargeCreditFailedError extends RechargeReviewError {
  constructor(message: string) {
    super({
      message,
      code: "RECHARGE_CREDIT_FAILED",
      status: 409,
      outcome: "failed",
    });
  }
}

const rechargeSelect = [
  "id",
  "recharge_no",
  "channel",
  "channel_code",
  "status",
  "amount",
  "payable_amount",
  "currency",
  "settlement_currency",
  "actual_received_usdt",
  "locked_settlement_rate",
  "transaction_reference",
  "provider_trade_no",
  "approved_at",
  "paid_at",
  "completed_at",
  "reviewed_at",
  "reviewed_by",
  "review_reason",
  "exception_type",
  "error_summary",
].join(",");

function normalizeRequestId(value: string | undefined) {
  const requestId = value?.trim();
  return requestId ? requestId.slice(0, 160) : randomUUID();
}

function parseRechargeReviewRow(
  value: unknown,
  outcomeMayHaveChanged: boolean,
): RechargeReviewRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    if (outcomeMayHaveChanged) {
      throw new RechargeReviewUncertainOutcomeError();
    }
    throw new RechargeReviewUnavailableError();
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string"
    || typeof row.recharge_no !== "string"
    || typeof row.status !== "string"
    || (
      typeof row.amount !== "string"
      && typeof row.amount !== "number"
    )
  ) {
    if (outcomeMayHaveChanged) {
      throw new RechargeReviewUncertainOutcomeError();
    }
    throw new RechargeReviewUnavailableError();
  }
  if (parseRechargeStatusStrict(row.status) === null) {
    if (outcomeMayHaveChanged) {
      throw new RechargeReviewUncertainOutcomeError();
    }
    throw new RechargeReviewUnavailableError(
      "充值记录状态异常，已停止审核写操作。",
    );
  }
  return {
    ...row,
    id: row.id,
    recharge_no: row.recharge_no,
    channel: typeof row.channel === "string" ? row.channel : null,
    channel_code: typeof row.channel_code === "string" ? row.channel_code : null,
    status: row.status,
    amount: row.amount,
    payable_amount:
      typeof row.payable_amount === "number"
      || typeof row.payable_amount === "string"
        ? row.payable_amount
        : null,
    currency: typeof row.currency === "string" ? row.currency : null,
    settlement_currency:
      typeof row.settlement_currency === "string" ? row.settlement_currency : null,
    actual_received_usdt:
      typeof row.actual_received_usdt === "number" || typeof row.actual_received_usdt === "string"
        ? row.actual_received_usdt
        : null,
    locked_settlement_rate:
      typeof row.locked_settlement_rate === "number" || typeof row.locked_settlement_rate === "string"
        ? row.locked_settlement_rate
        : null,
    transaction_reference:
      typeof row.transaction_reference === "string"
        ? row.transaction_reference
        : null,
    provider_trade_no:
      typeof row.provider_trade_no === "string"
        ? row.provider_trade_no
        : null,
    approved_at:
      typeof row.approved_at === "string" ? row.approved_at : null,
    paid_at: typeof row.paid_at === "string" ? row.paid_at : null,
    completed_at:
      typeof row.completed_at === "string" ? row.completed_at : null,
  };
}

function safeCreditFailureMessage(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof (error as { message?: unknown })?.message === "string"
      ? String((error as { message: string }).message)
      : "";

  if (/amount|金额/i.test(message)) {
    return "充值金额校验失败，余额未入账。";
  }
  if (/currency|币种/i.test(message)) {
    return "充值币种校验失败，余额未入账。";
  }
  if (/status|状态/i.test(message)) {
    return "当前充值状态不允许执行入账。";
  }
  return "充值入账失败，请核对记录后再决定是否重试。";
}

function isExplicitRpcFailure(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string"
    && /^(?:[0-9A-Z]{5}|PGRST\d+)$/.test(code);
}

async function appendEvent(
  service: SupabaseClient,
  row: {
    recharge_id: string;
    recharge_no: string;
    actor_user_id: string;
    actor_type: "admin" | "system";
    action: string;
    from_status: string;
    to_status: string;
    request_id: string;
    reason?: string | null;
    metadata: Record<string, unknown>;
  },
) {
  const phase = String(row.metadata.phase ?? "");
  const existingResult = await service
    .from("recharge_review_events")
    .select("id")
    .eq("recharge_id", row.recharge_id)
    .eq("request_id", row.request_id)
    .eq("action", row.action)
    .contains("metadata", { phase })
    .limit(1)
    .maybeSingle();

  if (existingResult.error) {
    throw new RechargeReviewAuditError(false);
  }
  if (existingResult.data) return { deduplicated: true };

  const { error } = await service
    .from("recharge_review_events")
    .insert({
      ...row,
      metadata: {
        ...row.metadata,
        event_deduplication: "best_effort_no_unique_constraint",
      },
    });

  if (error) throw new RechargeReviewAuditError(false);
  return { deduplicated: false };
}

async function readRecharge(
  service: SupabaseClient,
  rechargeId: string,
  outcomeMayHaveChanged = false,
): Promise<RechargeReviewRow> {
  const { data, error } = await service
    .from("account_recharges")
    .select(rechargeSelect)
    .eq("id", rechargeId)
    .maybeSingle();

  if (error) {
    if (outcomeMayHaveChanged) {
      throw new RechargeReviewUncertainOutcomeError();
    }
    throw new RechargeReviewUnavailableError();
  }
  if (!data) throw new RechargeReviewNotFoundError();
  return parseRechargeReviewRow(data, outcomeMayHaveChanged);
}

async function updateRechargeExact(
  service: SupabaseClient,
  rechargeId: string,
  expectedStatus: string,
  patch: Record<string, unknown>,
): Promise<{
  kind: "updated" | "not_updated" | "uncertain";
  row: RechargeReviewRow | null;
}> {
  return await executeRechargeWriteCas({
    executeWrite: () => service
      .from("account_recharges")
      .update(patch)
      .eq("id", rechargeId)
      .eq("status", expectedStatus)
      .select(rechargeSelect)
      .maybeSingle(),
    readLatest: () => readRecharge(service, rechargeId, true),
    parseRow: (data: unknown) => parseRechargeReviewRow(data, true),
  }) as {
    kind: "updated" | "not_updated" | "uncertain";
    row: RechargeReviewRow | null;
  };
}

async function completedResult(
  recharge: RechargeReviewRow,
  requestId: string,
): Promise<RechargeReviewResult> {
  await queueRechargeSuccessEmailBestEffort(recharge.id, "recharge_review").catch(() => undefined);
  return {
    recharge,
    code: "RECHARGE_REVIEW_COMPLETED",
    safeMessage: "充值已经完成。",
    idempotent: true,
    requestId,
    outcome: "idempotent",
    requiresManualReconciliation: false,
  };
}

function updatedResult(
  recharge: RechargeReviewRow,
  requestId: string,
): RechargeReviewResult {
  return {
    recharge,
    code: "RECHARGE_REVIEW_UPDATED",
    safeMessage: "充值审核状态已更新。",
    idempotent: false,
    requestId,
    outcome: "completed",
    requiresManualReconciliation: false,
  };
}

async function repairPaidCompletion(
  service: SupabaseClient,
  recharge: RechargeReviewRow,
  input: ReviewInput,
  requestId: string,
) {
  const timestamp = new Date().toISOString();
  const result = await executePaidCompletionRepair({
    compareAndSet: () => updateRechargeExact(
      service,
      recharge.id,
      "paid",
      {
        status: "succeeded",
        completed_at: recharge.completed_at ?? recharge.paid_at ?? timestamp,
        reviewed_at: timestamp,
        reviewed_by: input.adminId,
        exception_type: null,
        error_summary: null,
      },
    ),
    readLatest: () => readRecharge(service, recharge.id, true),
    writeCompleted: (latest: RechargeReviewRow) => appendEvent(service, {
      recharge_id: latest.id,
      recharge_no: latest.recharge_no,
      actor_user_id: input.adminId,
      actor_type: "system",
      action: "credit_succeeded",
      from_status: "paid",
      to_status: "succeeded",
      request_id: requestId,
      metadata: {
        phase: "completed",
        idempotent: true,
        completion_repair: true,
      },
    }),
  });
  if (result.kind === "completion_audit_failed") {
    throw new RechargeReviewAuditError(true, result.row?.status ?? null);
  }
  if (result.kind === "uncertain_succeeded") {
    throw new RechargeReviewUncertainOutcomeError("succeeded");
  }
  if (
    !["completed", "already_completed"].includes(result.kind)
    || !result.row
  ) {
    throw new RechargeReviewUncertainOutcomeError();
  }
  return result.row as RechargeReviewRow;
}

async function resolveTransitionResult(
  service: SupabaseClient,
  result: {
    kind: string;
    row?: RechargeReviewRow;
  },
  input: ReviewInput,
  requestId: string,
  priorStateChanged = false,
) {
  if (result.kind === "acquired" && result.row) return result.row;
  if (result.kind === "intent_audit_failed") {
    throw priorStateChanged
      ? new RechargeReviewPartialSuccessError()
      : new RechargeReviewAuditError(false);
  }
  if (result.kind === "completion_audit_failed") {
    throw new RechargeReviewAuditError(true, result.row?.status ?? null);
  }
  if (result.kind === "repair_paid" && result.row) {
    return repairPaidCompletion(service, result.row, input, requestId);
  }
  if (result.kind === "completed" && result.row) return result.row;
  if (result.kind === "write_outcome_uncertain") {
    throw new RechargeReviewUncertainOutcomeError(
      result.row?.status ?? (priorStateChanged ? "approved" : null),
    );
  }
  if (priorStateChanged && result.kind === "in_progress") {
    throw new RechargeReviewUncertainOutcomeError(
      result.row?.status ?? "processing",
    );
  }
  if (priorStateChanged) {
    throw new RechargeReviewPartialSuccessError(
      result.row?.status ?? "approved",
    );
  }
  throw new RechargeReviewConflictError(
    result.kind === "in_progress"
      ? "另一审核请求正在处理该充值，请勿重复操作。"
      : undefined,
  );
}

async function runAuditedTransition(
  service: SupabaseClient,
  input: ReviewInput,
  requestId: string,
  recharge: RechargeReviewRow,
  expectedStatus: string,
  targetStatus: string,
  patch: Record<string, unknown>,
  phasePrefix: string,
  priorStateChanged = false,
) {
  const eventBase = {
    recharge_id: recharge.id,
    recharge_no: recharge.recharge_no,
    actor_user_id: input.adminId,
    actor_type: "admin" as const,
    action: input.action,
    request_id: requestId,
    reason: input.reason || null,
  };
  const result = await executeAuditedRechargeTransition({
    expectedStatus,
    writeIntent: () => appendEvent(service, {
      ...eventBase,
      from_status: expectedStatus,
      to_status: expectedStatus,
      metadata: {
        phase: `${phasePrefix}_intent`,
        requested_to_status: targetStatus,
      },
    }),
    compareAndSet: () => updateRechargeExact(
      service,
      recharge.id,
      expectedStatus,
      patch,
    ),
    readLatest: () => readRecharge(service, recharge.id),
    writeCompleted: () => appendEvent(service, {
      ...eventBase,
      from_status: expectedStatus,
      to_status: targetStatus,
      metadata: { phase: `${phasePrefix}_completed` },
    }),
  });

  return resolveTransitionResult(
    service,
    result as { kind: string; row?: RechargeReviewRow },
    input,
    requestId,
    priorStateChanged,
  );
}

async function recordCreditSucceeded(
  service: SupabaseClient,
  recharge: RechargeReviewRow,
  input: ReviewInput,
  requestId: string,
  alreadyCompleted: boolean,
) {
  try {
    await appendEvent(service, {
      recharge_id: recharge.id,
      recharge_no: recharge.recharge_no,
      actor_user_id: input.adminId,
      actor_type: "system",
      action: "credit_succeeded",
      from_status: "processing",
      to_status: "succeeded",
      request_id: requestId,
      metadata: {
        phase: "completed",
        idempotent: alreadyCompleted,
      },
    });
  } catch {
    throw new RechargeReviewAuditError(true);
  }
}

async function reconcilePostRpcOutcome(
  service: SupabaseClient,
  input: ReviewInput,
  requestId: string,
  rpcOutcome:
    | { kind: "unknown"; result: null }
    | { kind: "succeeded"; result: ParsedRechargeCreditRpcSuccess },
) {
  const latest = await readRecharge(service, input.rechargeId, true);
  const decision = rpcOutcome.kind === "unknown"
    ? classifyUnknownRechargeCreditOutcome(latest.status)
    : classifyPostRpcStatus(latest.status);
  if (decision === "repair_paid") {
    return repairPaidCompletion(service, latest, input, requestId);
  }
  if (decision === "completed") {
    if (rpcOutcome.kind === "unknown") {
      throw new RechargeReviewUncertainOutcomeError("succeeded");
    }
    await recordCreditSucceeded(
      service,
      latest,
      input,
      requestId,
      rpcOutcome.result.alreadyCompleted,
    );
    return latest;
  }
  throw new RechargeReviewUncertainOutcomeError();
}

async function handleExplicitCreditFailure(
  service: SupabaseClient,
  recharge: RechargeReviewRow,
  input: ReviewInput,
  requestId: string,
  error: unknown,
): Promise<RechargeReviewRow> {
  const message = safeCreditFailureMessage(error);
  const result = await executeCreditFailureTransition({
    markFailed: () => updateRechargeExact(
      service,
      recharge.id,
      "processing",
      {
        status: "failed",
        exception_type: "credit_failed",
        error_summary: message,
      },
    ),
    readLatest: () => readRecharge(service, recharge.id, true),
    writeFailedEvent: (failed: RechargeReviewRow) => appendEvent(service, {
      recharge_id: failed.id,
      recharge_no: failed.recharge_no,
      actor_user_id: input.adminId,
      actor_type: "system",
      action: "credit_failed",
      from_status: "processing",
      to_status: "failed",
      request_id: requestId,
      reason: message,
      metadata: { phase: "completed" },
    }),
  });

  if (result.kind === "completion_audit_failed") {
    throw new RechargeReviewAuditError(true, result.row?.status ?? null);
  }
  if (result.kind !== "failed") {
    const latest = result.row as RechargeReviewRow;
    const decision = result.kind;
    if (decision === "repair_paid") {
      return repairPaidCompletion(service, latest, input, requestId);
    }
    if (decision === "completed") {
      return latest;
    }
    if (decision === "write_outcome_uncertain") {
      throw new RechargeReviewUncertainOutcomeError(latest?.status ?? null);
    }
    throw decision === "in_progress"
      ? new RechargeReviewConflictError(
          "充值仍由另一请求处理，失败状态未写入，请人工核对后再操作。",
        )
      : new RechargeReviewConflictError();
  }

  throw new RechargeCreditFailedError(message);
}

async function processCredit(
  service: SupabaseClient,
  recharge: RechargeReviewRow,
  input: ReviewInput,
  requestId: string,
) {
  const transactionReference = requireTransactionReference(recharge);
  const isUsdtSettlement = recharge.settlement_currency === "USDT"
    || recharge.channel === "usdt_bep20"
    || recharge.channel_code === "usdt_bep20";
  if (isUsdtSettlement && (
    recharge.currency !== "CNY"
    || recharge.settlement_currency !== "USDT"
    || recharge.actual_received_usdt === null
    || recharge.locked_settlement_rate === null
  )) {
    throw new RechargeReviewValidationError(
      "USDT-BEP20 充值缺少已核验的实际到账金额或锁定汇率，禁止入账。",
    );
  }

  return executeRechargeCreditAttempt({
    invokeRpc: () => isUsdtSettlement
      ? service.rpc("complete_account_recharge_usdt_cny_v1", {
          p_recharge_id: recharge.id,
          p_provider_transaction_id: transactionReference,
        })
      : service.rpc("complete_account_recharge", {
          p_recharge_id: recharge.id,
          p_provider_transaction_id: transactionReference,
          p_paid_amount: Number(recharge.payable_amount ?? recharge.amount),
          p_currency: recharge.currency ?? "CNY",
        }),
    isExplicitFailure: isExplicitRpcFailure,
    handleExplicitFailure: (error: unknown) => handleExplicitCreditFailure(
      service,
      recharge,
      input,
      requestId,
      error,
    ),
    reconcileOutcome: (outcome:
      | { kind: "unknown"; result: null }
      | { kind: "succeeded"; result: ParsedRechargeCreditRpcSuccess }) => {
      return reconcilePostRpcOutcome(
        service,
        input,
        requestId,
        outcome,
      );
    },
  });
}

function requireTransactionReference(recharge: RechargeReviewRow) {
  const transactionReference = String(
    recharge.transaction_reference ?? recharge.provider_trade_no ?? "",
  ).trim();
  if (!transactionReference) {
    throw new RechargeReviewValidationError(
      "缺少真实交易流水号，不能确认入账。",
    );
  }
  return transactionReference;
}

function requireReason(input: ReviewInput) {
  if (
    ["approve", "reject", "request_more_proof", "cancel"].includes(input.action)
    && !input.reason.trim()
  ) {
    throw new RechargeReviewValidationError("请填写操作原因。");
  }
}

export function classifyRechargeReviewError(error: unknown, requestId: string) {
  if (error instanceof RechargeReviewError) {
    return buildRechargeReviewErrorContract(error, requestId) as {
      status: number;
      body: {
        error: string;
        safeMessage: string;
        code: string;
        requestId: string;
        outcome: RechargeReviewOutcome;
        idempotent: boolean;
        requiresManualReconciliation: boolean;
        knownStatus: string | null;
      };
    };
  }
  return {
    status: 503,
    body: {
      error: "充值审核服务暂时不可用，请按诊断编号核对后再试。",
      safeMessage: "充值审核服务暂时不可用，请按诊断编号核对后再试。",
      code: "RECHARGE_REVIEW_UNAVAILABLE",
      requestId,
      outcome: "failed" as const,
      idempotent: false,
      requiresManualReconciliation: false,
      knownStatus: null,
    },
  };
}

export async function processRechargeReview(
  input: ReviewInput,
): Promise<RechargeReviewResult> {
  const service = getSupabaseServiceRoleClient();
  if (!service) throw new RechargeReviewUnavailableError();

  const requestId = normalizeRequestId(input.requestId);
  const recharge = await readRecharge(service, input.rechargeId);
  const rawStatus = String(recharge.status ?? "");

  if (rawStatus === "paid") {
    const repaired = await repairPaidCompletion(
      service,
      recharge,
      input,
      requestId,
    );
    return completedResult(repaired, requestId);
  }
  if (rawStatus === "succeeded") {
    return completedResult(recharge, requestId);
  }

  requireReason(input);
  const contract = getRechargeReviewActionContract(input.action, rawStatus);
  if (!contract) {
    throw new RechargeReviewConflictError(
      "当前充值状态不允许执行该操作。",
    );
  }

  const timestamp = new Date().toISOString();

  if (input.action === "approve") {
    const progress = {
      approvalStateChanged: false,
      processingClaimed: false,
      rpcAttempted: false,
      rpcMayHaveSucceeded: false,
    };
    const transactionReference = String(
      recharge.transaction_reference ?? recharge.provider_trade_no ?? "",
    ).trim();
    if (!transactionReference) {
      throw new RechargeReviewValidationError(
        "缺少真实交易流水号，不能确认入账。",
      );
    }

    const approved = await runAuditedTransition(
      service,
      input,
      requestId,
      recharge,
      "reviewing",
      "approved",
      {
        status: "approved",
        approved_at: recharge.approved_at ?? timestamp,
        reviewed_at: timestamp,
        reviewed_by: input.adminId,
        review_reason: input.reason.trim(),
        exception_type: null,
        error_summary: null,
      },
      "review",
    );
    progress.approvalStateChanged = approved.status === "approved";

    if (approved.status === "paid" || approved.status === "succeeded") {
      return completedResult(approved, requestId);
    }

    let processing: RechargeReviewRow;
    try {
      processing = await runAuditedTransition(
        service,
        input,
        requestId,
        approved,
        "approved",
        "processing",
        { status: "processing" },
        "credit",
        progress.approvalStateChanged,
      );
    } catch (error) {
      if (error instanceof RechargeReviewError) throw error;
      const interruption = classifyApproveProgress(progress);
      throw interruption.outcome === "partial_success"
        ? new RechargeReviewPartialSuccessError(
            interruption.knownStatus ?? "approved",
          )
        : new RechargeReviewUncertainOutcomeError(interruption.knownStatus);
    }
    if (processing.status === "paid" || processing.status === "succeeded") {
      return completedResult(processing, requestId);
    }
    progress.processingClaimed = processing.status === "processing";
    progress.rpcAttempted = true;
    progress.rpcMayHaveSucceeded = true;
    const completed = await processCredit(service, processing, input, requestId);
    return completedResult(completed, requestId);
  }

  if (input.action === "retry_credit") {
    requireTransactionReference(recharge);
    const processing = await runAuditedTransition(
      service,
      input,
      requestId,
      recharge,
      rawStatus,
      "processing",
      {
        status: "processing",
        reviewed_at: timestamp,
        reviewed_by: input.adminId,
        review_reason: input.reason.trim() || "重新处理入账",
        exception_type: null,
        error_summary: null,
      },
      "credit",
    );
    if (processing.status === "paid" || processing.status === "succeeded") {
      return completedResult(processing, requestId);
    }
    const completed = await processCredit(service, processing, input, requestId);
    return completedResult(completed, requestId);
  }

  const patch: Record<string, unknown> = {
    status: contract.to,
    reviewed_at: timestamp,
    reviewed_by: input.adminId,
    review_reason: input.reason.trim() || null,
  };
  if (contract.to === "reviewing") patch.reviewing_at = timestamp;
  if (contract.to === "rejected") patch.rejected_at = timestamp;
  if (contract.to === "cancelled") patch.cancelled_at = timestamp;

  const updated = await runAuditedTransition(
    service,
    input,
    requestId,
    recharge,
    contract.from,
    contract.to,
    patch,
    "review",
  );
  if (updated.status === "paid" || updated.status === "succeeded") {
    return completedResult(updated, requestId);
  }
  return updatedResult(updated, requestId);
}
