import { createHash } from "crypto";
import { NextResponse } from "next/server";

import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

const EXCLUDED_PREFIXES = ["/admin", "/api", "/_next", "/assets", "/favicon", "/robots.txt", "/sitemap", "/health"];
const SENSITIVE_QUERY_KEYS = ["token", "access_token", "refresh_token", "code", "password", "payment", "session", "signature", "sign", "key"];
const MAX_BODY_BYTES = 4096;
const DUPLICATE_WINDOW_MS = 2500;
const BOT_USER_AGENT_PATTERN =
  /bot|crawler|spider|crawling|slurp|bingpreview|headless|phantom|curl|wget|python-requests|httpclient|healthcheck/i;

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

function sanitizeReferrerHost(input: unknown) {
  if (typeof input !== "string" || !input.trim()) return null;
  try {
    const url = new URL(input);
    return url.hostname.slice(0, 120);
  } catch {
    return null;
  }
}

function inferPageType(path: string) {
  if (path === "/") return "home";
  if (path.startsWith("/products/")) return "product_detail";
  if (path.startsWith("/products")) return "product_list";
  if (path.startsWith("/login") || path.startsWith("/register")) return "auth";
  if (path.startsWith("/order-query")) return "order_query";
  if (path.startsWith("/legal") || path.startsWith("/privacy") || path.startsWith("/terms")) return "legal";
  return "public_page";
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "";
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || request.headers.get("x-client-ip") || "";
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return json({ ok: false, error: "统计请求过大" }, 413);

  const userAgent = request.headers.get("user-agent") ?? "";
  if (!userAgent || BOT_USER_AGENT_PATTERN.test(userAgent)) {
    return json({ ok: true, skipped: true, reason: "bot" });
  }

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

  const ip = getClientIp(request);
  const visitorKey = `anon:${hash(rawVisitorKey).slice(0, 64)}`;
  const sessionKey =
    typeof body.sessionKey === "string" && body.sessionKey.trim()
      ? hash(body.sessionKey.trim()).slice(0, 64)
      : null;

  const duplicateSince = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
  const { data: duplicateEvent, error: duplicateError } = await serviceClient
    .from("page_visit_events")
    .select("id")
    .eq("visitor_key", visitorKey)
    .eq("page_path", pagePath)
    .gte("visit_date", duplicateSince)
    .limit(1)
    .maybeSingle();

  if (!duplicateError && duplicateEvent) {
    return json({ ok: true, skipped: true, reason: "duplicate" });
  }

  const { error } = await serviceClient.from("page_visit_events").insert({
    page_path: pagePath,
    referrer_path: sanitizeReferrerHost(body.referrer),
    visitor_key: visitorKey,
    user_id: userId,
    session_key: sessionKey,
    user_agent_hash: userAgent ? hash(userAgent).slice(0, 64) : null,
    ip_hash: ip ? hash(ip).slice(0, 64) : null,
    metadata: {
      source: "frontend_page_view",
      version: 2,
      page_type: inferPageType(pagePath),
      environment: process.env.NODE_ENV,
    },
  });

  if (error) return json({ ok: false, error: "访问统计写入失败" }, 503);
  return json({ ok: true });
}
