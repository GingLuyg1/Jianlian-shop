"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const VISITOR_KEY = "jianlian_analytics_visitor";
const SESSION_KEY = "jianlian_analytics_session";
const LAST_EVENT_KEY = "jianlian_analytics_last_event";
const SESSION_TTL_MS = 30 * 60 * 1000;
const DEDUPE_BUCKET_MS = 2500;
const EXCLUDED_PREFIXES = ["/admin", "/api", "/_next", "/assets", "/favicon", "/robots.txt", "/sitemap", "/health"];
const EXCLUDED_EXTENSIONS = /\.(?:css|js|map|png|jpe?g|gif|svg|webp|ico|txt|xml|json)$/i;

function getOrCreateStorageValue(key: string) {
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(key, next);
  return next;
}

function createRandomId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getOrCreateSessionKey() {
  const now = Date.now();
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { id?: string; lastSeen?: number };
      if (parsed.id && parsed.lastSeen && now - parsed.lastSeen < SESSION_TTL_MS) {
        window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id: parsed.id, lastSeen: now }));
        return parsed.id;
      }
    } catch {
      // Fall through and create a new session key.
    }
  }

  const next = createRandomId();
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id: next, lastSeen: now }));
  return next;
}

export default function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    if (EXCLUDED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return;
    if (EXCLUDED_EXTENSIONS.test(pathname)) return;
    if (document.visibilityState === "hidden") return;

    const query = searchParams.toString();
    const path = `${pathname}${query ? `?${query}` : ""}`;
    const eventKey = `${path}:${Math.floor(Date.now() / DEDUPE_BUCKET_MS)}`;
    if (window.sessionStorage.getItem(LAST_EVENT_KEY) === eventKey) return;
    window.sessionStorage.setItem(LAST_EVENT_KEY, eventKey);

    window
      .fetch("/api/analytics/page-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          referrer: document.referrer || "",
          visitorKey: getOrCreateStorageValue(VISITOR_KEY),
          sessionKey: getOrCreateSessionKey(),
        }),
        keepalive: true,
      })
      .catch(() => {
        // Analytics must never block the storefront.
      });
  }, [pathname, searchParams]);

  return null;
}
