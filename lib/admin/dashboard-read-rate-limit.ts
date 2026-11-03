import "server-only";
import { NextResponse } from "next/server";

// Restored dashboard-only read budget. Do not change any payment/write policy.
const buckets = new Map<string, { count: number; resetAt: number }>();
export function checkRateLimit(_policy: "admin_analytics_read", identity: string, now = Date.now()) {
  buckets.forEach((entry, key) => { if (entry.resetAt <= now) buckets.delete(key); });
  let entry = buckets.get(identity);
  if (!entry) {
    if (buckets.size >= 1000) return { allowed: false, response: NextResponse.json({ error: "统计服务繁忙，请稍后再试。" }, { status: 429, headers: { "Retry-After": "60" } }) };
    entry = { count: 0, resetAt: now + 60_000 };
    buckets.set(identity, entry);
  }
  entry.count++;
    // Three independent date controls plus product paging must fit a normal visit.
    if (entry.count <= 18) return { allowed: true, response: undefined };
  return { allowed: false, response: NextResponse.json({ error: "统计查询过于频繁，请稍后再试。" }, { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))) } }) };
}
