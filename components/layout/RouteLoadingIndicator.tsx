"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const MIN_VISIBLE_MS = 520;
const SHOW_DELAY_MS = 140;
const MAX_VISIBLE_MS = 6500;
const NAVIGATION_STALL_MS = 2600;
const DOM_SETTLE_MS = 160;
const IMAGE_WAIT_TIMEOUT_MS = 4200;

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

function waitForDomToSettle(container: ParentNode) {
  return new Promise<void>((resolve) => {
    let settledTimer: number | null = null;

    const finish = () => {
      if (settledTimer) window.clearTimeout(settledTimer);
      observer.disconnect();
      resolve();
    };

    const armTimer = () => {
      if (settledTimer) window.clearTimeout(settledTimer);
      settledTimer = window.setTimeout(finish, DOM_SETTLE_MS);
    };

    const observer = new MutationObserver(armTimer);
    observer.observe(container, {
      attributes: true,
      childList: true,
      subtree: true,
    });

    armTimer();
  });
}

function waitForImage(image: HTMLImageElement) {
  if (image.complete && image.naturalWidth > 0) {
    return image.decode?.().catch(() => undefined) ?? Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const cleanup = () => {
      image.removeEventListener("load", onDone);
      image.removeEventListener("error", onDone);
      resolve();
    };
    const onDone = () => cleanup();

    image.addEventListener("load", onDone, { once: true });
    image.addEventListener("error", onDone, { once: true });
  }).then(() => image.decode?.().catch(() => undefined));
}

async function waitForImages(container: ParentNode) {
  const images = Array.from(container.querySelectorAll("img"));
  if (!images.length) return;

  await Promise.race([
    Promise.all(images.map(waitForImage)),
    new Promise<void>((resolve) =>
      window.setTimeout(resolve, IMAGE_WAIT_TIMEOUT_MS)
    ),
  ]);
}

async function waitForPageReady() {
  const container = document.querySelector("main") ?? document.body;

  await waitForFrame();
  await waitForDomToSettle(container);
  await waitForImages(container);
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

  const clearTimers = () => {
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
      await waitForPageReady();
    } catch (error) {
      console.error("[RouteLoadingIndicator] Failed to wait for page ready", error);
    }

    if (loadId !== loadIdRef.current || !visibleRef.current) return;

    const elapsed = Date.now() - startedAtRef.current;
    const delay = Math.max(120, MIN_VISIBLE_MS - elapsed);

    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
    }

    hideTimerRef.current = window.setTimeout(() => {
      if (loadId === loadIdRef.current) {
        visibleRef.current = false;
        setVisible(false);
      }
      hideTimerRef.current = null;
    }, delay);
  };

  const finishLoading = (loadId: number) => {
    if (loadId !== loadIdRef.current) return;

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

  const startLoading = (waitForCurrentPage = false) => {
    clearTimers();
    startedAtRef.current = Date.now();
    const loadId = loadIdRef.current + 1;
    loadIdRef.current = loadId;

    showTimerRef.current = window.setTimeout(() => {
      if (loadId !== loadIdRef.current) return;
      visibleRef.current = true;
      setVisible(true);
      showTimerRef.current = null;
    }, SHOW_DELAY_MS);

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
          startLoading(false);
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

    const handlePopState = () => startLoading(false);

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handlePopState);
      clearTimers();
    };
  }, []);

  useEffect(() => {
    if (routeKeyRef.current === routeKey) return;

    routeKeyRef.current = routeKey;

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
