"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_WAIT_MS = 900;
const MIN_VISIBLE_MS = 180;

type UseCategorySwitchOptions<T extends string> = {
  initialId: T;
  getImageSources: (id: T) => string[];
  onSwitchStart?: (id: T) => void;
};

export function useCategorySwitch<T extends string>({
  initialId,
  getImageSources,
  onSwitchStart,
}: UseCategorySwitchOptions<T>) {
  const requestIdRef = useRef(0);
  const currentIdRef = useRef(initialId);
  const pendingIdRef = useRef<T | null>(null);
  const getImageSourcesRef = useRef(getImageSources);
  const onSwitchStartRef = useRef(onSwitchStart);
  const [activeId, setActiveId] = useState<T>(initialId);
  const [pendingId, setPendingId] = useState<T | null>(null);
  const [isSwitching, setIsSwitching] = useState(true);

  useEffect(() => {
    getImageSourcesRef.current = getImageSources;
    onSwitchStartRef.current = onSwitchStart;
  }, [getImageSources, onSwitchStart]);

  const runSwitch = useCallback(
    async (nextId: T, force = false) => {
      if (!force && (pendingIdRef.current ?? currentIdRef.current) === nextId) {
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      pendingIdRef.current = nextId;
      setPendingId(nextId);
      setIsSwitching(true);
      onSwitchStartRef.current?.(nextId);

      const startedAt = Date.now();

      await Promise.race([
        preloadImages(getImageSourcesRef.current(nextId).slice(0, 8)),
        delay(MAX_WAIT_MS),
      ]);

      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_VISIBLE_MS) {
        await delay(MIN_VISIBLE_MS - elapsed);
      }

      if (requestIdRef.current !== requestId) return;

      currentIdRef.current = nextId;
      pendingIdRef.current = null;
      setActiveId(nextId);
      setPendingId(null);
      setIsSwitching(false);
    },
    []
  );

  useEffect(() => {
    runSwitch(initialId, true);
  }, [initialId, runSwitch]);

  return {
    activeId,
    selectedId: pendingId ?? activeId,
    pendingId,
    isSwitching,
    switchTo: runSwitch,
  };
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function preloadImages(sources: string[]) {
  if (sources.length === 0) return Promise.resolve();

  const uniqueSources = Array.from(new Set(sources.filter(Boolean)));

  return Promise.allSettled(
    uniqueSources.map(
      (source) =>
        new Promise<void>((resolve) => {
          const image = new Image();
          image.onload = () => resolve();
          image.onerror = () => resolve();
          image.src = source;
        })
    )
  );
}
