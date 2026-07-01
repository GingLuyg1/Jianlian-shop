import "server-only";

import { createHash } from "crypto";

const SENSITIVE_AUDIT_KEY_PATTERN =
  /password|token|secret|api[_-]?key|authorization|cookie|credential|content|card|code|raw|callback|proof|private|signature/i;

export type AuditIntegrityRecord = {
  id?: string | null;
  request_id?: string | null;
  admin_user_id?: string | null;
  admin_email?: string | null;
  actor_type?: string | null;
  actor_user_id?: string | null;
  actor_admin_id?: string | null;
  action?: string | null;
  module?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  target_label?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  business_no?: string | null;
  result?: string | null;
  reason?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  before_summary?: unknown;
  after_summary?: unknown;
  metadata?: unknown;
  created_at?: string | null;
  previous_hash?: string | null;
  record_hash?: string | null;
};

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}

export function redactForAuditIntegrity(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 5) return "[truncated]";
  if (typeof value === "string") return value.length > 300 ? `${value.slice(0, 300)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactForAuditIntegrity(item, depth + 1));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE_AUDIT_KEY_PATTERN.test(key)
        ? "[redacted]"
        : redactForAuditIntegrity(nested, depth + 1);
    }
    return output;
  }
  return String(value);
}

export function summarizeUserAgent(userAgent: string | null | undefined) {
  if (!userAgent) return null;
  return userAgent.length > 160 ? `${userAgent.slice(0, 160)}...` : userAgent;
}

export function hashIpAddress(ip: string | null | undefined) {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex");
}

export function createAuditRecordHash(record: AuditIntegrityRecord) {
  const payload = {
    id: record.id ?? null,
    request_id: record.request_id ?? null,
    actor_type: record.actor_type ?? (record.admin_user_id ? "admin" : "system"),
    actor_user_id: record.actor_user_id ?? null,
    actor_admin_id: record.actor_admin_id ?? record.admin_user_id ?? null,
    admin_email: record.admin_email ?? null,
    action: record.action ?? null,
    module: record.module ?? null,
    resource_type: record.resource_type ?? record.target_type ?? null,
    resource_id: record.resource_id ?? record.target_id ?? null,
    business_no: record.business_no ?? record.target_label ?? null,
    result: record.result ?? null,
    reason: record.reason ?? null,
    error_code: record.error_code ?? null,
    error_message: record.error_message ?? null,
    before_summary: redactForAuditIntegrity(record.before_summary),
    after_summary: redactForAuditIntegrity(record.after_summary),
    metadata: redactForAuditIntegrity(record.metadata),
    previous_hash: record.previous_hash ?? null,
    created_at: record.created_at ?? null,
  };

  return createHash("sha256").update(stableSerialize(payload)).digest("hex");
}

export function verifyAuditRecordHash(record: AuditIntegrityRecord) {
  if (!record.record_hash) {
    return { status: "missing" as const, expected: createAuditRecordHash(record), actual: null };
  }
  const expected = createAuditRecordHash(record);
  return {
    status: expected === record.record_hash ? ("valid" as const) : ("broken" as const),
    expected,
    actual: record.record_hash,
  };
}

export function isAuditIntegritySchemaMissing(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message ?? "") : String(error ?? "");
  return (
    code === "42703" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    message.includes("record_hash") ||
    message.includes("previous_hash") ||
    message.includes("schema cache")
  );
}
