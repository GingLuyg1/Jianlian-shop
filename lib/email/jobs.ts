import "server-only";

import { createHash, randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
import { validateBusinessEmailVariables } from "./contracts";
import {
  EMAIL_PROCESSING_STALE_MS,
  isIdempotencyKeyUniqueConflict,
  processEmailDeliveryJobRuntime,
  validateQueueUserId,
} from "./job-runtime.mjs";
import { sendEmail } from "./provider";
import { renderEmailTemplate } from "./templates";
import {
  DEFAULT_EMAIL_MAX_ATTEMPTS,
  EMAIL_RETRY_BASE_SECONDS,
  EMAIL_RETRY_MAX_SECONDS,
  NON_RETRYABLE_EMAIL_ERROR_CODES,
  type EmailBusinessType,
  type EmailDeliveryJobRecord,
  type EmailTemplateCode,
  type EmailTemplateRecord,
} from "./types";

export type QueueBusinessEmailInput = {
  userId: string;
  recipientEmail: string;
  templateCode: EmailTemplateCode | string;
  variables: Record<string, unknown>;
  businessType: EmailBusinessType | string;
  businessId?: string | null;
  businessNo?: string | null;
  idempotencyKey: string;
  metadata?: Record<string, unknown> | null;
};

export function normalizeEmailAddress(email: string) {
  return email.trim().toLowerCase();
}

export function maskEmailAddress(email: string | null | undefined) {
  const normalized = normalizeEmailAddress(email ?? "");
  if (!normalized.includes("@")) return "—";
  const [name, domain] = normalized.split("@");
  const prefix = name.slice(0, 2) || "*";
  return `${prefix}${"*".repeat(Math.max(2, name.length - 2))}@${domain}`;
}

export function hashEmailRecipient(email: string) {
  return createHash("sha256").update(normalizeEmailAddress(email)).digest("hex");
}

export function summarizeEmailError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error ?? "邮件服务异常");
  if (/relation .*email_.* does not exist|Could not find the table|schema cache/i.test(text)) {
    return "邮件功能尚未完成数据库初始化，请管理员执行邮件通知 migration。";
  }
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

export function isRetryableEmailError(code: string | null | undefined) {
  if (!code) return false;
  if (NON_RETRYABLE_EMAIL_ERROR_CODES.has(code)) return false;
  return /TIMEOUT|NETWORK|RATE_LIMIT|UNAVAILABLE|5\d\d|TEMPORARY/i.test(code);
}

export function computeNextRetryAt(attempts: number, now = new Date()) {
  const exponent = Math.max(0, attempts - 1);
  const seconds = Math.min(EMAIL_RETRY_MAX_SECONDS, EMAIL_RETRY_BASE_SECONDS * 2 ** exponent);
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

export async function queueBusinessEmail(input: QueueBusinessEmailInput) {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) return { ok: false as const, error: "邮件任务服务未配置：缺少 SUPABASE_SERVICE_ROLE_KEY。" };
  return queueBusinessEmailWithClient(supabase, input);
}

export async function queueBusinessEmailWithClient(supabase: SupabaseClient, input: QueueBusinessEmailInput) {
  const userIdentity = validateQueueUserId(input.userId);
  if (!userIdentity.ok) return userIdentity;
  const userId = userIdentity.userId;

  const recipientEmail = normalizeEmailAddress(input.recipientEmail);
  if (!recipientEmail || !recipientEmail.includes("@")) {
    return { ok: false as const, error: "收件邮箱格式不正确。" };
  }
  if (!input.idempotencyKey.trim()) return { ok: false as const, error: "缺少邮件幂等键。" };
  const contractValidation = validateBusinessEmailVariables(input.templateCode, input.variables);
  if (!contractValidation.ok) return contractValidation;

  const existing = await supabase
    .from("email_delivery_jobs")
    .select("*")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  if (existing.error) return { ok: false as const, error: summarizeEmailError(existing.error) };
  if (existing.data) return { ok: true as const, job: existing.data as EmailDeliveryJobRecord, deduped: true };

  const templateResult = await supabase
    .from("email_templates")
    .select("*")
    .eq("template_code", input.templateCode)
    .eq("status", "published")
    .eq("is_current", true)
    .maybeSingle();

  if (templateResult.error) return { ok: false as const, error: summarizeEmailError(templateResult.error) };
  if (!templateResult.data) return { ok: false as const, error: "邮件模板尚未发布，邮件任务未创建。" };

  const template = templateResult.data as EmailTemplateRecord;
  const rendered = renderEmailTemplate(template, input.variables);
  if (!rendered.ok) return { ok: false as const, error: rendered.error };

  const insertPayload = {
    user_id: userId,
    template_id: template.id,
    template_code: template.template_code,
    template_version: template.version,
    recipient_summary: maskEmailAddress(recipientEmail),
    recipient_hash: hashEmailRecipient(recipientEmail),
    recipient_encrypted_or_reference: `profile:${userId}`,
    business_type: input.businessType,
    business_id: input.businessId ?? null,
    business_no: input.businessNo ?? null,
    idempotency_key: input.idempotencyKey,
    subject_rendered: rendered.subject,
    html_rendered: rendered.html,
    text_rendered: rendered.text,
    status: "pending",
    attempts: 0,
    max_attempts: DEFAULT_EMAIL_MAX_ATTEMPTS,
    metadata: sanitizeEmailMetadata(input.metadata ?? {}),
  };

  const created = await supabase.from("email_delivery_jobs").insert(insertPayload).select("*").single();
  if (created.error) {
    if (isIdempotencyKeyUniqueConflict(created.error)) {
      const raced = await supabase
        .from("email_delivery_jobs")
        .select("*")
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (raced.error) return { ok: false as const, error: summarizeEmailError(raced.error) };
      if (raced.data) return { ok: true as const, job: raced.data as EmailDeliveryJobRecord, deduped: true };
    }
    return { ok: false as const, error: summarizeEmailError(created.error) };
  }
  if (!created.data) return { ok: false as const, error: "邮件任务创建失败。" };
  return { ok: true as const, job: created.data as EmailDeliveryJobRecord, deduped: false };
}

export async function processEmailDeliveryJob(jobId: string, triggerSource = "manual") {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) return { ok: false as const, error: "邮件任务服务未配置：缺少 SUPABASE_SERVICE_ROLE_KEY。" };

  return processEmailDeliveryJobWithClient(supabase, jobId, triggerSource);
}

export async function processEmailDeliveryJobWithClient(
  supabase: SupabaseClient,
  jobId: string,
  triggerSource = "manual",
  providerSend: typeof sendEmail = sendEmail,
  now: () => Date = () => new Date(),
) {
  return processEmailDeliveryJobRuntime({
    jobId,
    triggerSource,
    now,
    computeNextRetryAt,
    isRetryableError: isRetryableEmailError,
    loadJob: async (id: string) => {
      const loaded = await supabase.from("email_delivery_jobs").select("*").eq("id", id).maybeSingle();
      if (loaded.error) return { ok: false as const, error: summarizeEmailError(loaded.error) };
      const job = loaded.data as EmailWorkerJob | null;
      return job ? { ok: true as const, job } : { ok: false as const, error: "邮件任务不存在。" };
    },
    resolveRecipient: (job: EmailWorkerJob) => resolveTrustedRecipient(supabase, job),
    claimJob: async ({ job, attempts, claimedAt, triggerSource: source }: EmailClaimInput) => {
      const claimedAtIso = claimedAt.toISOString();
      let claim = supabase
        .from("email_delivery_jobs")
        .update({
          status: "processing",
          attempts,
          last_attempt_at: claimedAtIso,
          locked_at: claimedAtIso,
          locked_by: source,
        })
        .eq("id", job.id)
        .eq("status", job.status);

      claim = job.updated_at ? claim.eq("updated_at", job.updated_at) : claim.is("updated_at", null);
      claim = job.locked_at ? claim.eq("locked_at", job.locked_at) : claim.is("locked_at", null);
      const result = await claim.select("id").maybeSingle();
      if (result.error) return { ok: false as const, error: summarizeEmailError(result.error) };
      return { ok: true as const, claimed: Boolean(result.data) };
    },
    send: ({ job, recipient, triggerSource: source }: EmailSendRuntimeInput) => providerSend({
      to: recipient.email,
      subject: job.subject_rendered ?? "",
      html: job.html_rendered ?? "",
      text: job.text_rendered ?? "",
      templateCode: job.template_code,
      businessType: job.business_type ?? "system",
      businessId: job.business_id,
      businessNo: job.business_no,
      idempotencyKey: job.idempotency_key,
      metadata: { triggerSource: source },
    }),
    finalizeJob: async ({ job, result, outcome, claimedAt, completedAt }: EmailFinalizeInput) => {
      const updatePayload = {
        status: outcome.status,
        provider: result.provider,
        provider_message_id: result.providerMessageId,
        sent_at: outcome.sentAt,
        next_retry_at: outcome.nextRetryAt,
        last_error_code: result.errorCode,
        last_error_message: result.errorMessage,
        locked_at: null,
        locked_by: null,
        updated_at: completedAt.toISOString(),
      };
      const updated = await supabase
        .from("email_delivery_jobs")
        .update(updatePayload)
        .eq("id", job.id)
        .eq("status", "processing")
        .eq("locked_at", claimedAt.toISOString())
        .select("*")
        .maybeSingle();
      if (updated.error) return { ok: false as const, error: summarizeEmailError(updated.error) };
      if (!updated.data) return { ok: false as const, error: "邮件任务最终状态写入发生并发冲突。" };
      return { ok: true as const, job: updated.data as EmailDeliveryJobRecord };
    },
    recordAttempt: async ({ job, attempts, result, triggerSource: source }: EmailAttemptInput) => {
      const recorded = await supabase.from("email_delivery_attempts").insert({
        job_id: job.id,
        attempt_no: attempts,
        provider: result.provider,
        status: result.status,
        error_code: result.errorCode,
        error_message: result.errorMessage,
        provider_message_id: result.providerMessageId,
        metadata: { triggerSource: source },
      });
      return recorded.error
        ? { ok: false as const, error: summarizeEmailError(recorded.error) }
        : { ok: true as const };
    },
    warn: (code: string, context: Record<string, unknown>) => {
      console.warn(`[EmailWorker] ${code}`, sanitizeEmailMetadata(context));
    },
  });
}

type EmailWorkerJob = EmailDeliveryJobRecord & {
  subject_rendered?: string;
  html_rendered?: string;
  text_rendered?: string;
};

type EmailClaimInput = {
  job: EmailWorkerJob;
  attempts: number;
  claimedAt: Date;
  triggerSource: string;
};

type EmailSendRuntimeInput = {
  job: EmailWorkerJob;
  recipient: { email: string };
  triggerSource: string;
};

type EmailFinalizeInput = {
  job: EmailWorkerJob;
  result: Awaited<ReturnType<typeof sendEmail>>;
  outcome: { status: "sent" | "retrying" | "failed"; sentAt: string | null; nextRetryAt: string | null };
  claimedAt: Date;
  completedAt: Date;
};

type EmailAttemptInput = {
  job: EmailWorkerJob;
  attempts: number;
  result: Awaited<ReturnType<typeof sendEmail>>;
  triggerSource: string;
};

export async function processDueEmailDeliveryJobs(limit = 20, triggerSource = "worker") {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) return { ok: false as const, error: "邮件任务服务未配置：缺少 SUPABASE_SERVICE_ROLE_KEY。" };
  const safeLimit = Math.min(25, Math.max(1, Math.trunc(limit)));
  const now = new Date().toISOString();
  const due = await supabase
    .from("email_delivery_jobs")
    .select("id")
    .in("status", ["pending", "retrying"])
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(safeLimit);
  if (due.error) return { ok: false as const, error: summarizeEmailError(due.error) };

  const remaining = Math.max(0, safeLimit - (due.data?.length ?? 0));
  const staleBefore = new Date(Date.now() - EMAIL_PROCESSING_STALE_MS).toISOString();
  const stale = remaining > 0
    ? await supabase
        .from("email_delivery_jobs")
        .select("id")
        .eq("status", "processing")
        .lt("updated_at", staleBefore)
        .order("updated_at", { ascending: true })
        .limit(remaining)
    : { data: [] as Array<{ id: string }>, error: null };
  if (stale.error) return { ok: false as const, error: summarizeEmailError(stale.error) };

  const selected = [...(due.data ?? []), ...(stale.data ?? [])];

  const summary = { selected: selected.length, sent: 0, failed: 0, deduped: 0 };
  for (const row of selected) {
    const result = await processEmailDeliveryJobWithClient(supabase, String(row.id), triggerSource).catch(() => ({ ok: false as const, error: "邮件任务处理异常。" }));
    if (result.ok && "deduped" in result && result.deduped) summary.deduped += 1;
    else if (result.ok) summary.sent += 1;
    else summary.failed += 1;
  }
  return { ok: true as const, summary };
}

async function resolveTrustedRecipient(supabase: SupabaseClient, job: EmailDeliveryJobRecord) {
  if (!job.user_id) return { ok: false as const, error: "邮件任务缺少可信收件人引用，不能发送。" };
  const loaded = await supabase.auth.admin.getUserById(job.user_id);
  const email = normalizeEmailAddress(loaded.data.user?.email ?? "");
  if (loaded.error || !email || !email.includes("@")) return { ok: false as const, error: "无法解析可信收件邮箱。" };
  if (hashEmailRecipient(email) !== job.recipient_hash) return { ok: false as const, error: "收件邮箱已变化，请重新创建邮件任务。" };
  return { ok: true as const, email };
}

export async function auditEmailAdminAction(input: {
  request: Request;
  admin: { id: string; email?: string | null };
  action: string;
  targetId?: string | null;
  targetLabel?: string | null;
  result: "success" | "failed" | "denied" | "partial";
  reason?: string | null;
  beforeSummary?: Record<string, unknown> | null;
  afterSummary?: Record<string, unknown> | null;
  errorMessage?: string | null;
}) {
  return writeAdminAuditLog({
    request: input.request,
    admin: input.admin,
    module: "notifications",
    action: input.action,
    targetType: "email_notification",
    targetId: input.targetId ?? null,
    targetLabel: input.targetLabel ?? null,
    result: input.result === "partial" ? "failed" : input.result,
    beforeSummary: sanitizeEmailMetadata(input.beforeSummary ?? {}),
    afterSummary: sanitizeEmailMetadata({ ...(input.afterSummary ?? {}), reason: input.reason ?? null }),
    errorMessage: input.errorMessage ?? null,
  });
}

function sanitizeEmailMetadata(value: Record<string, unknown>) {
  const blocked = new Set(["password", "token", "secret", "api_key", "authorization", "html", "content"]);
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (blocked.has(key.toLowerCase())) {
      result[key] = "[redacted]";
    } else if (typeof item === "string") {
      result[key] = item.length > 160 ? `${item.slice(0, 157)}...` : item;
    } else {
      result[key] = item;
    }
  }
  return result;
}

export function createEmailIdempotencyKey(parts: Array<string | number | null | undefined>) {
  return parts.map((part) => String(part ?? "none").trim()).join(":") || randomUUID();
}


