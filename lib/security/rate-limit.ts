import "server-only";

import { createHash } from "crypto";
import { NextResponse } from "next/server";

export type RateLimitPolicyName =
  | "catalog_read"
  | "order_create"
  | "order_lookup"
  | "auth_resend"
  | "payment_session_create"
  | "payment_status_query"
  | "recharge_create"
  | "refund_create"
  | "admin_write"
  | "inventory_import"
  | "media_upload"
  | "internal_task";

type RateLimitPolicy = {
  windowMs: number;
  max: number;
  message: string;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter: number;
  response?: NextResponse;
};

const RATE_LIMIT_POLICIES: Record<RateLimitPolicyName, RateLimitPolicy> = {
  catalog_read: { windowMs: 60_000, max: 120, message: "请求过于频繁，请稍后再试。" },
  order_create: { windowMs: 60_000, max: 8, message: "下单请求过于频繁，请稍后再试。" },
  order_lookup: { windowMs: 300_000, max: 8, message: "订单查询尝试过于频繁，请稍后再试。" },
  auth_resend: { windowMs: 300_000, max: 3, message: "验证邮件发送过于频繁，请稍后再试。" },
  payment_session_create: { windowMs: 60_000, max: 10, message: "支付请求过于频繁，请稍后再试。" },
  payment_status_query: { windowMs: 30_000, max: 30, message: "支付状态查询过于频繁，请稍后再试。" },
  recharge_create: { windowMs: 60_000, max: 6, message: "充值请求过于频繁，请稍后再试。" },
  refund_create: { windowMs: 300_000, max: 5, message: "退款申请过于频繁，请稍后再试。" },
  admin_write: { windowMs: 60_000, max: 30, message: "后台操作过于频繁，请稍后再试。" },
  inventory_import: { windowMs: 300_000, max: 6, message: "库存导入过于频繁，请稍后再试。" },
  media_upload: { windowMs: 300_000, max: 10, message: "媒体上传过于频繁，请稍后再试。" },
  internal_task: { windowMs: 300_000, max: 3, message: "内部任务触发过于频繁，请稍后再试。" },
};

const buckets = new Map<string, RateLimitEntry>();
let lastSweepAt = 0;

export function getRateLimitPolicy(name: RateLimitPolicyName) {
  return RATE_LIMIT_POLICIES[name];
}

export function hashRateLimitValue(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export function getRequestSourceKey(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const ip = forwardedFor || realIp || "unknown";
  const userAgent = request.headers.get("user-agent")?.slice(0, 120) || "unknown";
  return `src:${hashRateLimitValue(`${ip}:${userAgent}`)}`;
}

export function getUserRateLimitKey(userId: string, scope = "user") {
  return `${scope}:user:${hashRateLimitValue(userId)}`;
}

export function getAdminRateLimitKey(adminId: string, scope = "admin") {
  return `${scope}:admin:${hashRateLimitValue(adminId)}`;
}

export function getBusinessRateLimitKey(userId: string, businessId: string, scope: string) {
  return `${scope}:business:${hashRateLimitValue(`${userId}:${businessId}`)}`;
}

export function getInternalTaskRateLimitKey(secret: string, task: string) {
  return `internal:${task}:${hashRateLimitValue(secret || "missing")}`;
}

export function checkRateLimit(policyName: RateLimitPolicyName, identityKey: string, now = Date.now()): RateLimitResult {
  sweepExpiredBuckets(now);

  const policy = RATE_LIMIT_POLICIES[policyName];
  const key = `${policyName}:${identityKey}`;
  const current = buckets.get(key);
  const entry =
    current && current.resetAt > now
      ? current
      : {
          count: 0,
          resetAt: now + policy.windowMs,
        };

  entry.count += 1;
  buckets.set(key, entry);

  const remaining = Math.max(0, policy.max - entry.count);
  const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  if (entry.count <= policy.max) {
    return { allowed: true, limit: policy.max, remaining, resetAt: entry.resetAt, retryAfter };
  }

  const response = NextResponse.json(
    {
      error: policy.message,
      code: "RATE_LIMITED",
      retryAfter,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(policy.max),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(entry.resetAt / 1000)),
      },
    }
  );

  return { allowed: false, limit: policy.max, remaining: 0, resetAt: entry.resetAt, retryAfter, response };
}

export function checkRequestSize(request: Request, maxBytes: number) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > maxBytes) {
    return NextResponse.json(
      { error: "请求内容过大，请减少单次提交的数据量。", code: "REQUEST_TOO_LARGE" },
      { status: 413 }
    );
  }
  return null;
}

export function clampPageSize(value: number, max: number, fallback: number) {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.trunc(value), max);
}

function sweepExpiredBuckets(now: number) {
  if (now - lastSweepAt < 60_000) return;
  lastSweepAt = now;
  for (const [key, entry] of Array.from(buckets.entries())) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}



