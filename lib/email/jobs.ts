import "server-only";

import { createHash, randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { writeAdminAuditLog } from "@/lib/admin/audit-log-service";
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
  userId?: string | null;
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
  const recipientEmail = normalizeEmailAddress(input.recipientEmail);
  if (!recipientEmail || !recipientEmail.includes("@")) {
    return { ok: false as const, error: "收件邮箱格式不正确。" };
  }
  if (!input.idempotencyKey.trim()) return { ok: false as const, error: "缺少邮件幂等键。" };

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
    user_id: input.userId ?? null,
    template_id: template.id,
    template_code: template.template_code,
    template_version: template.version,
    recipient_summary: maskEmailAddress(recipientEmail),
    recipient_hash: hashEmailRecipient(recipientEmail),
    recipient_encrypted_or_reference: input.userId ? `profile:${input.userId}` : null,
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
  if (created.error || !created.data) return { ok: false as const, error: summarizeEmailError(created.error) };
  return { ok: true as const, job: created.data as EmailDeliveryJobRecord, deduped: false };
}

export async function processEmailDeliveryJob(jobId: string, triggerSource = "manual") {
  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) return { ok: false as const, error: "邮件任务服务未配置：缺少 SUPABASE_SERVICE_ROLE_KEY。" };

  const loaded = await supabase.from("email_delivery_jobs").select("*").eq("id", jobId).maybeSingle();
  if (loaded.error) return { ok: false as const, error: summarizeEmailError(loaded.error) };
  const job = loaded.data as (EmailDeliveryJobRecord & { subject_rendered?: string; html_rendered?: string; text_rendered?: string }) | null;
  if (!job) return { ok: false as const, error: "邮件任务不存在。" };
  if (job.status === "sent") return { ok: true as const, job, deduped: true };
  if (job.status === "cancelled") return { ok: false as const, error: "邮件任务已取消，不能继续发送。" };
  if (job.attempts >= job.max_attempts) return { ok: false as const, error: "邮件任务已达到最大重试次数。" };

  const attempts = job.attempts + 1;
  await supabase
    .from("email_delivery_jobs")
    .update({ status: "processing", attempts, last_attempt_at: new Date().toISOString(), locked_by: triggerSource })
    .eq("id", job.id);

  const result = await sendEmail({
    to: job.recipient_summary,
    subject: job.subject_rendered ?? "",
    html: job.html_rendered ?? "",
    text: job.text_rendered ?? "",
    templateCode: job.template_code,
    businessType: job.business_type ?? "system",
    businessId: job.business_id,
    businessNo: job.business_no,
    idempotencyKey: job.idempotency_key,
    metadata: { triggerSource },
  });

  const now = new Date().toISOString();
  const nextStatus = result.status === "sent" ? "sent" : isRetryableEmailError(result.errorCode) ? "retrying" : "failed";
  const updatePayload = {
    status: nextStatus,
    provider: result.provider,
    provider_message_id: result.providerMessageId,
    sent_at: result.status === "sent" ? now : null,
    next_retry_at: nextStatus === "retrying" ? computeNextRetryAt(attempts) : null,
    last_error_code: result.errorCode,
    last_error_message: result.errorMessage,
    locked_at: null,
    locked_by: null,
    updated_at: now,
  };

  const updated = await supabase.from("email_delivery_jobs").update(updatePayload).eq("id", job.id).select("*").single();
  await supabase.from("email_delivery_attempts").insert({
    job_id: job.id,
    attempt_no: attempts,
    provider: result.provider,
    status: result.status,
    error_code: result.errorCode,
    error_message: result.errorMessage,
    provider_message_id: result.providerMessageId,
    metadata: { triggerSource },
  });

  if (updated.error || !updated.data) return { ok: false as const, error: summarizeEmailError(updated.error) };
  return { ok: result.status === "sent", job: updated.data as EmailDeliveryJobRecord, result };
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


