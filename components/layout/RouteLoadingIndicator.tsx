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

  const startLoading = (waitForCurrentPage = false, targetPath = window.location.pathname) => {
    clearTimers();
    accountTargetRef.current = isAccountDataPage(targetPath) ? targetPath : null;
    startedAtRef.current = Date.now();
    const loadId = loadIdRef.current + 1;
    loadIdRef.current = loadId;

    showTimerRef.current = window.setTimeout(() => {
      if (loadId !== loadIdRef.current) return;
      visibleRef.current = true;
      setVisible(true);
      showTimerRef.current = null;
    }, SHOW_DELAY_MS);

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
          if (isCatalogCategoryPath(url.pathname) || url.pathname === "/checkout") {
            cancelLoading();
            return;
          }
          clearCatalogRoutePending();
          startLoading(false, url.pathname);
        }
        return;
      }

      const button = target?.closest("button") as HTMLButtonElement | null;
      const shouldHintButtonRoute =
        button &&
        !button.disabled &&
        button.hasAttribute("data-route-loading") &&
        !button.hasAttribute("popovertarget") &&
        Boolean(button.closest("main"));

      if (shouldHintButtonRoute) {
        startLoading(true);
      }
    };

    const handlePopState = () => {
      if (isCatalogCategoryPath(window.location.pathname) || window.location.pathname === "/checkout") {
        cancelLoading();
        return;
      }
      clearCatalogRoutePending();
      startLoading(false);
    };

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handlePopState);
      loadIdRef.current += 1;
      clearTimers();
    };
  }, []);

  useEffect(() => {
    if (routeKeyRef.current === routeKey) return;

    routeKeyRef.current = routeKey;

    if (isCatalogCategoryPath(pathname) || pathname === "/checkout") {
      cancelLoading();
      return;
    }

    clearCatalogRoutePending();

    if (!visibleRef.current && !showTimerRef.current) {
      startLoading(true);
      return;
    }

    finishLoading(loadIdRef.current);
  }, [routeKey, visible]);

  if (!visible) return null;

  return (
    <div className="route-loading-shell pointer-events-none fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-background/35 backdrop-blur-[1px]" />
      <div className="h-1 w-full overflow-hidden bg-primary/10">
        <div className="route-loading-bar h-full w-1/2 rounded-r-full bg-primary" />
      </div>
      <div className="route-loading-toast absolute left-1/2 top-[82px] flex -translate-x-1/2 items-center gap-2 rounded-full border border-primary/15 bg-white/95 px-4 py-2 text-sm font-medium text-primary shadow-lg backdrop-blur">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
        正在加载页面
      </div>
    </div>
  );
}
