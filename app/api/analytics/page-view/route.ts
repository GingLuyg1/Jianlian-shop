import { createHash } from "crypto";
import { NextResponse } from "next/server";

import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

const EXCLUDED_PREFIXES = ["/admin", "/api", "/_next", "/assets", "/favicon", "/robots.txt", "/sitemap", "/health"];
const SENSITIVE_QUERY_KEYS = ["token", "access_token", "refresh_token", "code", "password", "payment", "session", "signature", "sign", "key"];

function json(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function sanitizePath(input: unknown) {
  if (typeof input !== "string") return null;
  let url: URL;
  try {
    url = input.startsWith("http") ? new URL(input) : new URL(input, "https://www.jianlian.shop");
  } catch {
    return null;
  }

  const pathname = url.pathname || "/";
  if (EXCLUDED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return null;

  const safeParams = new URLSearchParams();
  url.searchParams.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    if (SENSITIVE_QUERY_KEYS.some((sensitiveKey) => normalizedKey.includes(sensitiveKey))) return;
    if (value.length > 80) return;
    safeParams.set(key, value);
  });

  const query = safeParams.toString();
  return `${pathname}${query ? `?${query}` : ""}`.slice(0, 512);
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "";
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || request.headers.get("x-client-ip") || "";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    path?: unknown;
    referrer?: unknown;
    visitorKey?: unknown;
    sessionKey?: unknown;
  };

  const pagePath = sanitizePath(body.path);
  if (!pagePath) return json({ ok: true, skipped: true });

  const rawVisitorKey = typeof body.visitorKey === "string" ? body.visitorKey.trim() : "";
  if (!rawVisitorKey || rawVisitorKey.length > 128) return json({ ok: false, error: "访问标识无效" }, 400);

  const serviceClient = getSupabaseServiceRoleClient();
  if (!serviceClient) return json({ ok: false, error: "访问统计未配置" }, 503);

  let userId: string | null = null;
  if (hasSupabaseServerConfig()) {
    const supabase = getSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  }

  const userAgent = request.headers.get("user-agent") ?? "";
  const ip = getClientIp(request);
  const visitorKey = userId ? `user:${hash(userId)}` : `anon:${hash(rawVisitorKey)}`;
  const sessionKey =
    typeof body.sessionKey === "string" && body.sessionKey.trim()
      ? hash(body.sessionKey.trim()).slice(0, 64)
      : null;

  const { error } = await serviceClient.from("page_visit_events").insert({
    page_path: pagePath,
    referrer_path: sanitizePath(body.referrer),
    visitor_key: visitorKey,
    user_id: userId,
    session_key: sessionKey,
    user_agent_hash: userAgent ? hash(userAgent).slice(0, 64) : null,
    ip_hash: ip ? hash(ip).slice(0, 64) : null,
    metadata: { source: "frontend_page_view", version: 1 },
  });

  if (error) return json({ ok: false, error: "访问统计写入失败" }, 503);
  return json({ ok: true });
}
