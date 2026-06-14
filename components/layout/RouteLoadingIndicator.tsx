"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const MIN_VISIBLE_MS = 420;
const FALLBACK_HIDE_MS = 1800;

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function isSamePageUrl(url: URL) {
  return (
    url.origin === window.location.origin &&
    url.pathname === window.location.pathname &&
    url.search === window.location.search
  );
}

export default function RouteLoadingIndicator() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = useMemo(
    () => `${pathname}?${searchParams.toString()}`,
    [pathname, searchParams]
  );
  const [visible, setVisible] = useState(false);
  const startedAtRef = useRef(0);
  const fallbackTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (fallbackTimerRef.current) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const startLoading = () => {
    clearTimers();
    startedAtRef.current = Date.now();
    setVisible(true);
    fallbackTimerRef.current = window.setTimeout(() => {
      setVisible(false);
      fallbackTimerRef.current = null;
    }, FALLBACK_HIDE_MS);
  };

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || isModifiedClick(event)) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;

      if (anchor) {
        const url = new URL(anchor.href, window.location.href);
        const isInternalRoute =
          url.origin === window.location.origin &&
          anchor.target !== "_blank" &&
          !anchor.hasAttribute("download") &&
          !isSamePageUrl(url);

        if (isInternalRoute) {
          startLoading();
        }
        return;
      }

      const button = target?.closest("button") as HTMLButtonElement | null;
      const shouldHintButtonRoute =
        button &&
        !button.disabled &&
        button.type !== "submit" &&
        !button.hasAttribute("popovertarget") &&
        Boolean(button.closest("main"));

      if (shouldHintButtonRoute) {
        startLoading();
      }
    };

    const handlePopState = () => startLoading();

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handlePopState);
      clearTimers();
    };
  }, []);

  useEffect(() => {
    if (!visible) return;

    const elapsed = Date.now() - startedAtRef.current;
    const delay = Math.max(120, MIN_VISIBLE_MS - elapsed);

    if (fallbackTimerRef.current) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

    hideTimerRef.current = window.setTimeout(() => {
      setVisible(false);
      hideTimerRef.current = null;
    }, delay);
  }, [routeKey]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]">
      <div className="h-1 w-full overflow-hidden bg-primary/10">
        <div className="route-loading-bar h-full w-1/2 rounded-r-full bg-primary" />
      </div>
      <div className="route-loading-toast absolute left-1/2 top-[82px] flex -translate-x-1/2 items-center gap-2 rounded-full border border-primary/15 bg-white/90 px-4 py-2 text-sm font-medium text-primary shadow-lg backdrop-blur">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
        页面加载中
      </div>
    </div>
  );
}
