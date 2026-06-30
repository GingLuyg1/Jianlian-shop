import "server-only";

import { randomUUID } from "crypto";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export type AdminAuditModule =
  | "payments"
  | "recharges"
  | "orders"
  | "users"
  | "products"
  | "categories"
  | "inventory"
  | "delivery"
  | "settings"
  | "system"
  | "privacy";
export type AdminAuditResult = "success" | "failed" | "denied";

export type AdminAuditUser = {
  id?: string | null;
  email?: string | null;
};

export type AdminAuditInput = {
  request?: Request;
  admin?: AdminAuditUser | null;
  action: string;
  module: AdminAuditModule;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  requestId?: string | null;
  result: AdminAuditResult;
  errorCode?: string | null;
  errorMessage?: unknown;
  beforeSummary?: unknown;
  afterSummary?: unknown;
  metadata?: unknown;
};

const SENSITIVE_KEY_PATTERN =
  /password|token|secret|api[_-]?key|sign|signature|private|credential|content|card|code|payload|raw|callback|proof|cookie|authorization/i;

export function getAuditErrorMessage(error: unknown, fallback = "操作失败，请稍后重试") {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function truncateText(value: string, maxLength = 600) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

export function sanitizeAuditValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 4) return "[truncated]";
  if (typeof value === "string") return truncateText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => sanitizeAuditValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? "[redacted]"
        : sanitizeAuditValue(nestedValue, depth + 1);
    }
    return output;
  }
  return String(value);
}

function getRequestIp(request?: Request) {
  if (!request) return null;
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || null;
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-client-ip")
  );
}

export function getAuditRequestId(request?: Request, fallback?: string | null) {
  return (
    fallback ||
    request?.headers.get("x-request-id") ||
    request?.headers.get("x-correlation-id") ||
    randomUUID()
  );
}

export async function writeAdminAuditLog(input: AdminAuditInput) {
  try {
    const serviceClient = getSupabaseServiceRoleClient();
    if (!serviceClient) {
      console.warn("[AdminAudit] skipped: SUPABASE_SERVICE_ROLE_KEY is not configured");
      return { ok: false, skipped: true };
    }

    const requestId = getAuditRequestId(input.request, input.requestId);
    const row = {
      admin_user_id: input.admin?.id ?? null,
      admin_email: input.admin?.email ?? null,
      action: input.action,
      module: input.module,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      target_label: input.targetLabel ?? null,
      request_id: requestId,
      ip_address: getRequestIp(input.request),
      user_agent: input.request?.headers.get("user-agent") ?? null,
      result: input.result,
      error_code: input.errorCode ?? null,
      error_message: input.errorMessage
        ? truncateText(getAuditErrorMessage(input.errorMessage))
        : null,
      before_summary: sanitizeAuditValue(input.beforeSummary) ?? null,
      after_summary: sanitizeAuditValue(input.afterSummary) ?? null,
      metadata: sanitizeAuditValue(input.metadata) ?? {},
    };

    const { error } = await serviceClient.from("admin_audit_logs").insert(row);
    if (error) {
      console.error("[AdminAudit] write failed", error);
      return { ok: false, error };
    }

    return { ok: true, requestId };
  } catch (error) {
    console.error("[AdminAudit] unexpected write failure", error);
    return { ok: false, error };
  }
}


