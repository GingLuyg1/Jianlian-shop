"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { clearCatalogRoutePending, isCatalogCategoryPath } from "@/lib/motion/catalog-route-exit";
import { isAccountDataPage, waitForAccountPageSettled } from "@/lib/motion/account-page-ready";

const MIN_VISIBLE_MS = 180;
const SHOW_DELAY_MS = 140;
const MAX_VISIBLE_MS = 3000;
const NAVIGATION_STALL_MS = 2600;

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

function waitForFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

async function waitForPageReady() {
  // Route commit is the critical signal. Product imagery and secondary content
  // have their own local loading states and must not hold the global indicator.
  await waitForFrame();
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
  const showTimerRef = useRef<number | null>(null);
  const maxTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const stallTimerRef = useRef<number | null>(null);
  const loadIdRef = useRef(0);
  const visibleRef = useRef(false);
  const routeKeyRef = useRef(routeKey);
  const accountTargetRef = useRef<string | null>(null);
  const readyAbortRef = useRef<AbortController | null>(null);

  const clearTimers = () => {
    readyAbortRef.current?.abort();
    readyAbortRef.current = null;
    if (showTimerRef.current) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (maxTimerRef.current) {
      window.clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (stallTimerRef.current) {
      window.clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  };

  const hideWhenReady = async (loadId: number) => {
    try {
      const target = accountTargetRef.current;
      if (target) {
        readyAbortRef.current?.abort();
        const controller = new AbortController();
        readyAbortRef.current = controller;
        if (!await waitForAccountPageSettled(target, controller.signal)) return;
        if (loadId !== loadIdRef.current) return;
        // Do not cancel the delayed show on route commit: a fast route may
        // still have a slow account GET. Cancel it only once that GET settles.
        if (showTimerRef.current) { window.clearTimeout(showTimerRef.current); showTimerRef.current = null; }
      }
      await waitForPageReady();
    } catch (error) {
      console.error("[RouteLoadingIndicator] Failed to wait for page ready", error);
    }

    if (loadId !== loadIdRef.current || !visibleRef.current) return;

    const elapsed = Date.now() - startedAtRef.current;
    const delay = Math.max(0, MIN_VISIBLE_MS - elapsed);

    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
    }

    hideTimerRef.current = window.setTimeout(() => {
      if (loadId === loadIdRef.current) {
        visibleRef.current = false;
        accountTargetRef.current = null;
        setVisible(false);
      }
      hideTimerRef.current = null;
    }, delay);
  };

  const finishLoading = (loadId: number) => {
    if (loadId !== loadIdRef.current) return;
    if (accountTargetRef.current) { void hideWhenReady(loadId); return; }

    if (showTimerRef.current) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }

    if (!visibleRef.current) {
      setVisible(false);
      return;
    }

    void hideWhenReady(loadId);
  };

  const cancelLoading = () => {
    clearTimers();
    loadIdRef.current += 1;
    accountTargetRef.current = null;
    visibleRef.current = false;
    setVisible(false);
  };

  const startLoading = (
    waitForCurrentPage = false,
    targetPath = window.location.pathname,
    immediate = false
  ) => {
    clearTimers();
    accountTargetRef.current = isAccountDataPage(targetPath) ? targetPath : null;
    startedAtRef.current = Date.now();
    const loadId = loadIdRef.current + 1;
    loadIdRef.current = loadId;

    if (immediate) {
      visibleRef.current = true;
      setVisible(true);
    } else {
      showTimerRef.current = window.setTimeout(() => {
        if (loadId !== loadIdRef.current) return;
        visibleRef.current = true;
        setVisible(true);
        showTimerRef.current = null;
      }, SHOW_DELAY_MS);
    }

    if (!accountTargetRef.current) {
      maxTimerRef.current = window.setTimeout(() => {
        if (loadId === loadIdRef.current) {
          visibleRef.current = false;
          setVisible(false);
        }
        maxTimerRef.current = null;
      }, MAX_VISIBLE_MS);

      stallTimerRef.current = window.setTimeout(() => {
        finishLoading(loadId);
        stallTimerRef.current = null;
      }, NAVIGATION_STALL_MS);
    }

    if (waitForCurrentPage) {
      window.setTimeout(() => {
        finishLoading(loadId);
      }, 0);
    }
  };

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

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
          clearCatalogRoutePending();
          startLoading(false, url.pathname);
        }
        return;
      }

      const button = target?.closest("button") as HTMLButtonElement | null;
      if (button && !button.disabled && button.hasAttribute("data-catalog-card")) {
        startLoading(false, "/checkout", true);
        return;
      }

      const shouldHintButtonRoute =
        button &&
        !button.disabled &&
        (button.hasAttribute("data-route-loading") ||
          button.getAttribute("aria-label") === "关闭下单页面" ||
          (button.getAttribute("title") || "").includes("关闭") ||
          (button.hasAttribute("data-route-loading") && Boolean(button.closest("main"))));

      if (shouldHintButtonRoute) {
        startLoading(false, window.location.pathname, true);
      }
    };

    const handleCustomStart = () => {
      startLoading(false, window.location.pathname, true);
    };

    const handlePopState = () => {
      clearCatalogRoutePending();
      startLoading(false);
    };

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("jianlian:start-top-loading", handleCustomStart);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("jianlian:start-top-loading", handleCustomStart);
      loadIdRef.current += 1;
      clearTimers();
    };
  }, []);

  useEffect(() => {
    if (routeKeyRef.current === routeKey) return;

    routeKeyRef.current = routeKey;

    clearCatalogRoutePending();

    if (!visibleRef.current && !showTimerRef.current) {
      startLoading(true);
      return;
    }

    finishLoading(loadIdRef.current);
  }, [routeKey, visible]);

  if (!visible) return null;

  return (
    <div className="route-loading-shell pointer-events-none fixed top-0 left-0 right-0 z-[120]">
      <div className="h-[3px] w-full overflow-hidden bg-orange-200/35">
        <div className="route-loading-bar h-full w-2/3 rounded-full bg-gradient-to-r from-orange-400/20 via-[#df7334] to-amber-400/90 shadow-[0_0_10px_rgba(223,115,52,0.55)]" />
      </div>
    </div>
  );
}
