"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const VISITOR_KEY = "jianlian_analytics_visitor";
const SESSION_KEY = "jianlian_analytics_session";
const LAST_EVENT_KEY = "jianlian_analytics_last_event";
const EXCLUDED_PREFIXES = ["/admin", "/api", "/_next", "/assets", "/favicon", "/health"];

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

export default function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    if (EXCLUDED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return;
    if (document.visibilityState === "hidden") return;

    const query = searchParams.toString();
    const path = `${pathname}${query ? `?${query}` : ""}`;
    const eventKey = `${path}:${Math.floor(Date.now() / 3000)}`;
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
          sessionKey: getOrCreateStorageValue(SESSION_KEY),
        }),
        keepalive: true,
      })
      .catch(() => {
        // Analytics must never block the storefront.
      });
  }, [pathname, searchParams]);

  return null;
}
