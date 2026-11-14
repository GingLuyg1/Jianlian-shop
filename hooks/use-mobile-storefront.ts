"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "jianlian:mobile-preview";

type MobilePreviewState = {
  /** Whether the 390px mobile preview frame is explicitly active */
  mobilePreview: boolean;
  /** Whether the floating preview toggle button should be shown (localhost / preview) */
  showToggle: boolean;
  /** Whether the actual browser window is narrower than desktop (< 1024px) */
  compactViewport: boolean;
};

const SERVER_STATE: MobilePreviewState = {
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

function syncDocumentAttribute(active: boolean) {
  if (typeof document === "undefined") return;
  if (active) {
    document.documentElement.dataset.mobilePreview = "true";
  } else {
    delete document.documentElement.dataset.mobilePreview;
  }
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
  const queryOverride = params.get("mobilePreview");

  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    stored = null;
  }

  let mobilePreview = false;
  if (queryOverride === "1" || queryOverride === "true") {
    mobilePreview = true;
  } else if (queryOverride === "0" || queryOverride === "false") {
    mobilePreview = false;
  } else if (stored === "1") {
    mobilePreview = true;
  } else if (stored === "0") {
    mobilePreview = false;
  } else if (isLocal) {
    // Default to 390px mobile preview on localhost so the user can immediately inspect the mobile UI
    mobilePreview = true;
  }

  const compactViewport = window.innerWidth < 1024;
  const showToggle = isLocal || queryOverride !== null || stored !== null;

  clientState = {
    mobilePreview,
    showToggle,
    compactViewport,
  };
  syncDocumentAttribute(mobilePreview);

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

export function setMobilePreview(next: boolean) {
  initClientState();
  clientState = {
    ...clientState,
    mobilePreview: next,
    showToggle: true,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    // Ignore storage errors
  }
  syncDocumentAttribute(next);
  emit();
}

export function toggleMobilePreview() {
  initClientState();
  setMobilePreview(!clientState.mobilePreview);
}

export function useMobileStorefront() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    syncDocumentAttribute(snapshot.mobilePreview);
  }, [snapshot.mobilePreview]);

  const mobilePreview = hydrated ? snapshot.mobilePreview : false;
  const compactViewport = hydrated ? snapshot.compactViewport : false;
  const showToggle = hydrated ? snapshot.showToggle : false;

  return {
    /** True when either the 390px preview toggle is ON or the screen width is < 1024px */
    isMobile: mobilePreview || compactViewport,
    /** True specifically when the 390px phone frame preview is active */
    mobilePreview,
    /** True when the floating preview switch button should render */
    showToggle,
    setMobilePreview,
    toggleMobilePreview,
  };
}
