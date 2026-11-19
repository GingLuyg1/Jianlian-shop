"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "jianlian:mobile-preview-width";

export type MobilePreviewSize = 360 | 375 | 390 | 430 | 1366 | 1440 | 1920 | 2560 | null;

type MobilePreviewState = {
  /** Active simulated width (375, 390, 430, 1366, 1440, 1920, 2560), or null if desktop full width */
  previewWidth: MobilePreviewSize;
  /** Whether mobile phone preview frame (< 1024px) is active */
  mobilePreview: boolean;
  /** Whether preview toggle should be shown (localhost / preview) */
  showToggle: boolean;
  /** Whether the actual browser window is narrower than desktop (< 1024px) */
  compactViewport: boolean;
};

const SERVER_STATE: MobilePreviewState = {
  previewWidth: null,
  mobilePreview: false,
  showToggle: false,
  compactViewport: false,
};

let clientState: MobilePreviewState = SERVER_STATE;
let initialized = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function syncDocumentAttribute(width: MobilePreviewSize) {
  if (typeof document === "undefined") return;
  if (width !== null) {
    if (width < 1024) {
      document.documentElement.dataset.mobilePreview = "true";
      delete document.documentElement.dataset.laptopPreview;
    } else {
      delete document.documentElement.dataset.mobilePreview;
      document.documentElement.dataset.laptopPreview = "true";
    }
    document.documentElement.style.setProperty("--mobile-preview-width", `${width}px`);
  } else {
    delete document.documentElement.dataset.mobilePreview;
    delete document.documentElement.dataset.laptopPreview;
    document.documentElement.style.removeProperty("--mobile-preview-width");
  }
}

function parseWidthValue(raw: string | null): MobilePreviewSize | undefined {
  if (
    raw === "360" ||
    raw === "375" ||
    raw === "390" ||
    raw === "430" ||
    raw === "1366" ||
    raw === "1440" ||
    raw === "1920" ||
    raw === "2560"
  ) {
    return Number(raw) as MobilePreviewSize;
  }
  if (raw === "0" || raw === "false" || raw === "none" || raw === "full" || raw === "null") {
    return null;
  }
  if (raw === "1" || raw === "true" || raw === "mobile") {
    return 390;
  }
  if (raw === "laptop") {
    return 1366;
  }
  if (raw === "desktop") {
    return 1920;
  }
  return undefined;
}

function initClientState() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const hostname = window.location.hostname;
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".local");
  const params = new URLSearchParams(window.location.search);
  const queryOverride = parseWidthValue(params.get("mobilePreview") ?? params.get("previewWidth"));

  let stored: MobilePreviewSize | undefined = undefined;
  try {
    const rawStored = window.localStorage.getItem(STORAGE_KEY);
    stored = parseWidthValue(rawStored);
  } catch {
    stored = undefined;
  }

  let previewWidth: MobilePreviewSize = null;
  if (queryOverride !== undefined) {
    previewWidth = queryOverride;
  } else if (stored !== undefined) {
    previewWidth = stored;
  } else if (isLocal && window.innerWidth < 1024) {
    // Default to 390px mobile only when on narrow viewport on local
    previewWidth = 390;
  }

  const compactViewport = window.innerWidth < 1024;
  const showToggle = isLocal || queryOverride !== undefined || stored !== undefined;
  const isSimulatedMobile = previewWidth !== null && previewWidth < 1024;

  clientState = {
    previewWidth,
    mobilePreview: isSimulatedMobile,
    showToggle,
    compactViewport,
  };
  syncDocumentAttribute(previewWidth);

  const handleResize = () => {
    const nextCompact = window.innerWidth < 1024;
    if (nextCompact !== clientState.compactViewport) {
      clientState = { ...clientState, compactViewport: nextCompact };
      emit();
    }
  };

  window.addEventListener("resize", handleResize, { passive: true });
}

function subscribe(listener: () => void) {
  initClientState();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): MobilePreviewState {
  initClientState();
  return clientState;
}

function getServerSnapshot(): MobilePreviewState {
  return SERVER_STATE;
}

export function setMobilePreviewSize(next: MobilePreviewSize) {
  initClientState();
  const isSimulatedMobile = next !== null && next < 1024;
  clientState = {
    ...clientState,
    previewWidth: next,
    mobilePreview: isSimulatedMobile,
    showToggle: true,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, next !== null ? String(next) : "0");
  } catch {
    // Ignore storage errors
  }
  syncDocumentAttribute(next);
  emit();
}

export function setMobilePreview(next: boolean) {
  setMobilePreviewSize(next ? 390 : null);
}

export function cycleMobilePreviewSize() {
  initClientState();
  const current = clientState.previewWidth;
  let next: MobilePreviewSize = null;
  if (current === 375) next = 390;
  else if (current === 390) next = 430;
  else if (current === 430) next = 1366;
  else if (current === 1366) next = null;
  else next = 390;
  setMobilePreviewSize(next);
}

export function toggleMobilePreview() {
  initClientState();
  if (clientState.previewWidth !== null) {
    setMobilePreviewSize(null);
  } else {
    setMobilePreviewSize(390);
  }
}

export function useMobileStorefront() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    syncDocumentAttribute(snapshot.previewWidth);
  }, [snapshot.previewWidth]);

  const previewWidth = hydrated ? snapshot.previewWidth : null;
  const isSimulatedMobile = previewWidth !== null && previewWidth < 1024;
  const compactViewport = hydrated ? snapshot.compactViewport : false;
  const showToggle = hydrated ? snapshot.showToggle : false;

  return {
    /** True when either a mobile preview frame (< 1024) is active or the screen width is < 1024px */
    isMobile: isSimulatedMobile || (previewWidth === null && compactViewport),
    /** Current simulated device width (375, 390, 430, 1366, 1440, 1920, 2560) or null */
    previewWidth,
    /** True specifically when a mobile phone frame preview (< 1024px) is active */
    mobilePreview: isSimulatedMobile,
    /** True when the floating preview switch controls should render */
    showToggle,
    setMobilePreview,
    setMobilePreviewSize,
    cycleMobilePreviewSize,
    toggleMobilePreview,
  };
}
