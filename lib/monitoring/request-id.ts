import { randomUUID } from "crypto";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,119}$/;
const MAX_REQUEST_ID_LENGTH = 120;

export function createRequestId(prefix = "req") {
  const safePrefix = prefix.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 16) || "req";
  return `${safePrefix}_${randomUUID()}`;
}

export function validateRequestId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_REQUEST_ID_LENGTH) return null;
  if (!REQUEST_ID_PATTERN.test(trimmed)) return null;
  return trimmed;
}

export function getRequestIdFromRequest(request: Request, prefix = "req") {
  return validateRequestId(request.headers.get("x-request-id")) ?? createRequestId(prefix);
}

export function withRequestIdHeader(response: Response, requestId: string) {
  response.headers.set("X-Request-ID", requestId);
  return response;
}

export function createChildRequestId(requestId: string, suffix: string) {
  const safeSuffix = suffix.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || "step";
  return `${requestId}_${safeSuffix}`.slice(0, MAX_REQUEST_ID_LENGTH);
}
