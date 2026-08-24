// @ts-check

/**
 * @typedef {import("./types").EmailDeliveryJobRecord & { subject_rendered?: string; html_rendered?: string; text_rendered?: string }} EmailRuntimeJob
 * @typedef {import("./types").SendEmailResult} EmailSendResult
 * @typedef {{ status: "sent" | "retrying" | "failed"; sentAt: string | null; nextRetryAt: string | null }} EmailDeliveryOutcome
 * @typedef {{ ok: true; job: EmailRuntimeJob } | { ok: false; error: string }} LoadJobResult
 * @typedef {{ ok: true; email: string } | { ok: false; error: string }} ResolveRecipientResult
 * @typedef {{ ok: true; claimed: boolean } | { ok: false; error: string }} ClaimJobResult
 * @typedef {{ ok: true; job: EmailRuntimeJob } | { ok: false; error: string }} FinalizeJobResult
 * @typedef {{ ok: true } | { ok: false; error: string }} RecordAttemptResult
 * @typedef {{ job: EmailRuntimeJob; attempts: number; claimedAt: Date; triggerSource: string }} ClaimJobInput
 * @typedef {{ job: EmailRuntimeJob; recipient: { email: string }; triggerSource: string }} SendRuntimeInput
 * @typedef {{ job: EmailRuntimeJob; attempts: number; result: EmailSendResult; outcome: EmailDeliveryOutcome; claimedAt: Date; completedAt: Date }} FinalizeJobInput
 * @typedef {{ job: EmailRuntimeJob; attempts: number; result: EmailSendResult; triggerSource: string }} RecordAttemptInput
 * @typedef {{
 *   jobId: string;
 *   triggerSource: string;
 *   now?: () => Date;
 *   loadJob: (jobId: string) => Promise<LoadJobResult>;
 *   resolveRecipient: (job: EmailRuntimeJob) => Promise<ResolveRecipientResult>;
 *   claimJob: (input: ClaimJobInput) => Promise<ClaimJobResult>;
 *   send: (input: SendRuntimeInput) => Promise<EmailSendResult>;
 *   finalizeJob: (input: FinalizeJobInput) => Promise<FinalizeJobResult>;
 *   recordAttempt: (input: RecordAttemptInput) => Promise<RecordAttemptResult>;
 *   warn?: (code: string, context: { jobId: string; attemptNo: number }) => void;
 *   computeNextRetryAt: (attempts: number, now: Date) => string;
 *   isRetryableError: (code: string | null | undefined) => boolean;
 * }} EmailRuntimeDependencies
 * @typedef {{ ok: boolean; job?: EmailRuntimeJob; error?: string; deduped?: boolean; result?: EmailSendResult; attemptLogWarning?: string | null }} EmailRuntimeResult
 * @typedef {{ ok: true; userId: string } | { ok: false; error: string }} QueueUserIdResult
 */

export const EMAIL_PROCESSING_STALE_MS = 15 * 60_000;

/** @param {unknown} userId @returns {QueueUserIdResult} */
export function validateQueueUserId(userId) {
  return typeof userId === "string" && userId.trim()
    ? { ok: true, userId: userId.trim() }
    : { ok: false, error: "用户业务邮件缺少可信 userId，邮件任务未创建。" };
}

/** @param {unknown} error */
export function isIdempotencyKeyUniqueConflict(error) {
  if (!error || typeof error !== "object") return false;
  const row = /** @type {Record<string, unknown>} */ (error);
  if (row.code !== "23505") return false;
  const diagnostic = [row.message, row.details, row.hint]
    .filter((value) => typeof value === "string")
    .join(" ");
  return /idempotency_key|email_delivery_jobs_idempotency_unique/i.test(diagnostic);
}

/** @param {Pick<EmailRuntimeJob, "status" | "updated_at">} job @param {Date} [now] */
export function isStaleProcessingJob(job, now = new Date()) {
  if (job.status !== "processing" || !job.updated_at) return false;
  const updatedAt = new Date(job.updated_at).getTime();
  return Number.isFinite(updatedAt) && now.getTime() - updatedAt > EMAIL_PROCESSING_STALE_MS;
}

/**
 * @param {{ result: EmailSendResult; attempts: number; maxAttempts: number; now: Date; computeNextRetryAt: (attempts: number, now: Date) => string; isRetryableError: (code: string | null | undefined) => boolean }} input
 * @returns {EmailDeliveryOutcome}
 */
export function decideEmailDeliveryOutcome({ result, attempts, maxAttempts, now, computeNextRetryAt, isRetryableError }) {
  if (result.status === "sent") return { status: "sent", sentAt: now.toISOString(), nextRetryAt: null };
  const canRetry = attempts < maxAttempts && isRetryableError(result.errorCode);
  return {
    status: canRetry ? "retrying" : "failed",
    sentAt: null,
    nextRetryAt: canRetry ? computeNextRetryAt(attempts, now) : null,
  };
}

/** @param {EmailRuntimeDependencies} dependencies @returns {Promise<EmailRuntimeResult>} */
export async function processEmailDeliveryJobRuntime({
  jobId, triggerSource, now = () => new Date(), loadJob, resolveRecipient, claimJob, send,
  finalizeJob, recordAttempt, warn, computeNextRetryAt, isRetryableError,
}) {
  const loaded = await loadJob(jobId);
  if (!loaded.ok) return loaded;
  const job = loaded.job;
  if (job.status === "sent") return { ok: true, job, deduped: true };
  if (job.status === "cancelled") return { ok: false, error: "邮件任务已取消，不能继续发送。" };
  if (job.attempts >= job.max_attempts) return { ok: false, error: "邮件任务已达到最大重试次数。" };
  if (job.status === "processing" && !isStaleProcessingJob(job, now())) {
    return { ok: false, error: "邮件任务正在由其他 Worker 处理。" };
  }

  const recipient = await resolveRecipient(job);
  if (!recipient.ok) return recipient;
  const attempts = job.attempts + 1;
  const claimedAt = now();
  const claimed = await claimJob({ job, attempts, claimedAt, triggerSource });
  if (!claimed.ok) return claimed;
  if (!claimed.claimed) return { ok: false, error: "邮件任务已被其他 Worker 领取。" };

  const result = await send({ job, recipient, triggerSource });
  const completedAt = now();
  const outcome = decideEmailDeliveryOutcome({
    result, attempts, maxAttempts: job.max_attempts, now: completedAt, computeNextRetryAt, isRetryableError,
  });
  const finalized = await finalizeJob({ job, attempts, result, outcome, claimedAt, completedAt });
  if (!finalized.ok) return finalized;

  /** @type {string | null} */
  let attemptLogWarning = null;
  /** @type {RecordAttemptResult} */
  let attemptRecorded;
  try {
    attemptRecorded = await recordAttempt({ job, attempts, result, triggerSource });
  } catch {
    attemptRecorded = { ok: false, error: "邮件发送尝试日志写入异常。" };
  }
  if (!attemptRecorded.ok) {
    attemptLogWarning = attemptRecorded.error || "邮件发送尝试日志写入失败。";
    try {
      warn?.("email_delivery_attempt_write_failed", { jobId: job.id, attemptNo: attempts });
    } catch {
      // Warning failures must never alter an already-finalized delivery job.
    }
  }
  return { ok: result.status === "sent", job: finalized.job, result, attemptLogWarning };
}
