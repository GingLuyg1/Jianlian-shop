import "server-only";

import { randomUUID, createHash } from "crypto";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export type LogLevel = "debug" | "info" | "warn" | "error" | "critical";

export type MonitoringCategory =
  | "products"
  | "sku"
  | "orders"
  | "inventory"
  | "payments"
  | "recharges"
  | "balance"
  | "delivery"
  | "reconciliation"
  | "notifications"
  | "auth"
  | "system"
  | "performance";

export type MonitoringLogInput = {
  level: LogLevel;
  category: MonitoringCategory;
  event: string;
  message: string;
  requestId?: string;
  userId?: string | null;
  adminId?: string | null;
  orderId?: string | null;
  paymentId?: string | null;
  productId?: string | null;
  skuId?: string | null;
  route?: string | null;
  method?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  errorCode?: string | null;
  metadata?: Record<string, unknown> | null;
};

const SENSITIVE_KEY_PATTERN = /password|token|secret|key|signature|authorization|cookie|credential|private|card|delivery_content|content|code/i;

export function createRequestId(prefix = "req") {
  return `${prefix}_${randomUUID()}`;
}

export function sanitizeForLog(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.length > 240) return `${value.slice(0, 240)}...`;
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeForLog(item));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 60)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key) ? "已脱敏" : sanitizeForLog(entry);
    }
    return output;
  }
  return String(value);
}

export function getSafeErrorMessage(error: unknown, fallback = "操作失败，请稍后重试") {
  if (error instanceof Error && error.message) return sanitizeMessage(error.message);
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return sanitizeMessage(message);
  }
  return fallback;
}

export function sanitizeMessage(message: string) {
  return message
    .replace(/[A-Za-z]:\\[^\s]+/g, "[path]")
    .replace(/\/[^\s]+\/[^\s]+/g, "[path]")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[redacted]")
    .replace(/(key|token|secret|signature)=([^&\s]+)/gi, "$1=[redacted]")
    .slice(0, 800);
}

export function logServerEvent(input: MonitoringLogInput) {
  const payload = normalizeLogInput(input);
  if (process.env.NODE_ENV === "production" && payload.level === "debug") return;

  const line = JSON.stringify(payload);
  if (payload.level === "error" || payload.level === "critical") {
    console.error(line);
  } else if (payload.level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export async function recordSystemError(input: MonitoringLogInput & { title?: string; status?: string }) {
  const requestId = input.requestId ?? createRequestId("err");
  const normalized = normalizeLogInput({ ...input, requestId });
  logServerEvent({ ...input, requestId });

  const service = getSupabaseServiceRoleClient();
  if (!service) {
    return { ok: false, requestId, skipped: "service_role_not_configured" as const };
  }

  const fingerprint = createFingerprint([
    normalized.category,
    normalized.event,
    normalized.error_code,
    normalized.route,
    normalized.message,
  ]);

  const row = {
    fingerprint,
    level: normalized.level,
    category: normalized.category,
    error_code: normalized.error_code,
    title: input.title ?? normalized.event,
    message: normalized.message,
    route: normalized.route,
    request_id: normalized.request_id,
    user_id: normalized.user_id,
    admin_id: normalized.admin_id,
    order_id: normalized.order_id,
    payment_id: normalized.payment_id,
    product_id: normalized.product_id,
    sku_id: normalized.sku_id,
    status: input.status ?? "open",
    metadata: normalized.metadata ?? {},
  };

  try {
    const { error } = await service.rpc("upsert_system_error_event", { p_event: row });
    if (error) {
      logServerEvent({
        level: "warn",
        category: "system",
        event: "system_error_event_write_failed",
        message: getSafeErrorMessage(error, "异常事件写入失败"),
        requestId,
        errorCode: "MONITORING_WRITE_FAILED",
      });
      return { ok: false, requestId, error: "write_failed" as const };
    }
    return { ok: true, requestId };
  } catch (error) {
    logServerEvent({
      level: "warn",
      category: "system",
      event: "system_error_event_write_exception",
      message: getSafeErrorMessage(error, "异常事件写入异常"),
      requestId,
      errorCode: "MONITORING_WRITE_EXCEPTION",
    });
    return { ok: false, requestId, error: "write_exception" as const };
  }
}

export async function recordApiError(input: {
  error: unknown;
  category: MonitoringCategory;
  event: string;
  route: string;
  method?: string;
  statusCode?: number;
  requestId?: string;
  userId?: string | null;
  adminId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const requestId = input.requestId ?? createRequestId("api");
  await recordSystemError({
    level: input.statusCode && input.statusCode >= 500 ? "error" : "warn",
    category: input.category,
    event: input.event,
    message: getSafeErrorMessage(input.error),
    requestId,
    route: input.route,
    method: input.method,
    statusCode: input.statusCode,
    userId: input.userId,
    adminId: input.adminId,
    errorCode: inferErrorCode(input.error, input.event),
    metadata: input.metadata,
  });
  return requestId;
}

export async function recordPerformance(input: Omit<MonitoringLogInput, "level" | "category" | "event" | "message"> & {
  event: string;
  durationMs: number;
  warnAtMs?: number;
  errorAtMs?: number;
}) {
  const warnAt = input.warnAtMs ?? 1200;
  const errorAt = input.errorAtMs ?? 5000;
  const level: LogLevel = input.durationMs >= errorAt ? "error" : input.durationMs >= warnAt ? "warn" : "info";
  const payload: MonitoringLogInput = {
    ...input,
    level,
    category: "performance",
    message: `${input.event} completed in ${Math.round(input.durationMs)}ms`,
    errorCode: level === "error" ? "SLOW_REQUEST_ERROR" : level === "warn" ? "SLOW_REQUEST_WARN" : null,
  };
  if (level === "info") {
    logServerEvent(payload);
  } else {
    await recordSystemError(payload);
  }
}

function normalizeLogInput(input: MonitoringLogInput) {
  return {
    timestamp: new Date().toISOString(),
    level: input.level,
    category: input.category,
    event: input.event,
    message: sanitizeMessage(input.message),
    request_id: input.requestId ?? null,
    user_id: input.userId ?? null,
    admin_id: input.adminId ?? null,
    order_id: input.orderId ?? null,
    payment_id: input.paymentId ?? null,
    product_id: input.productId ?? null,
    sku_id: input.skuId ?? null,
    route: input.route ?? null,
    method: input.method ?? null,
    status_code: input.statusCode ?? null,
    duration_ms: input.durationMs == null ? null : Math.round(input.durationMs),
    error_code: input.errorCode ?? null,
    metadata: sanitizeForLog(input.metadata ?? null),
    environment: process.env.NODE_ENV ?? "unknown",
    release: process.env.NEXT_PUBLIC_APP_VERSION ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  };
}

function createFingerprint(parts: unknown[]) {
  return createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("|"))
    .digest("hex");
}

function inferErrorCode(error: unknown, fallback: string) {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown; errorCode?: unknown }).code ?? (error as { errorCode?: unknown }).errorCode;
    if (typeof code === "string" && code.trim()) return code.slice(0, 80);
  }
  return fallback.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 80);
}
