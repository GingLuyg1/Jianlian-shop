"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

import { centeredScrollTop, wheelVisual } from "@/lib/motion/progressive-wheel";

type WheelMotionOptions = {
  activeId?: string;
  contentKey: string;
  resetKey?: string;
};

/** One DOM-only animation loop shared by the secondary rail and product list. */
export function useProgressiveWheelMotion({ activeId, contentKey, resetKey }: WheelMotionOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scheduleRef = useRef<() => void>(() => undefined);
  const previousResetKey = useRef(resetKey);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (previousResetKey.current !== resetKey) {
      container.scrollTop = 0;
      previousResetKey.current = resetKey;
    }

    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia("(min-width: 1024px)");
    let frame = 0;
    const render = () => {
      frame = 0;
      const items = Array.from(container.querySelectorAll<HTMLElement>("[data-wheel-item]"));
      const animate = desktop.matches && !motionPreference.matches && container.scrollHeight > container.clientHeight + 1;
      const viewportHeight = container.clientHeight;
      const progress = (container.scrollTop / Math.max(1, container.scrollHeight - viewportHeight));
      // Read layout for every row before writing styles, avoiding read/write thrash.
      const values = items.map((item) => animate
        ? wheelVisual(item.offsetTop - container.scrollTop + item.offsetHeight / 2, viewportHeight, progress, item.dataset.wheelItem === activeId)
        : { scale: 1, opacity: 1 });
      items.forEach((item, index) => {
        item.style.setProperty("--wheel-scale", values[index].scale.toFixed(4));
        item.style.setProperty("--wheel-opacity", values[index].opacity.toFixed(4));
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(render); };
    scheduleRef.current = schedule;
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    container.addEventListener("scroll", schedule, { passive: true });
    motionPreference.addEventListener("change", schedule);
    desktop.addEventListener("change", schedule);
    schedule();
    return () => {
      container.removeEventListener("scroll", schedule);
      motionPreference.removeEventListener("change", schedule);
      desktop.removeEventListener("change", schedule);
      observer.disconnect();
      cancelAnimationFrame(frame);
      scheduleRef.current = () => undefined;
    };
  }, [activeId, contentKey, resetKey]);

  const centerItem = useCallback((id: string) => {
    const container = containerRef.current;
    if (!container) return;
    const items = Array.from(container.querySelectorAll<HTMLElement>("[data-wheel-item]"));
    const index = items.findIndex((item) => item.dataset.wheelItem === id);
    if (index < 0) return;
    const item = items[index];
    const top = centeredScrollTop(
      item.offsetTop,
      item.offsetHeight,
      container.clientHeight,
      container.scrollHeight - container.clientHeight,
      index,
      items.length,
    );
    item.style.setProperty("--wheel-scale", "1");
    item.style.setProperty("--wheel-opacity", "1");
    container.scrollTo({ top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    scheduleRef.current();
  }, []);

  const resetScroll = useCallback(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
    scheduleRef.current();
  }, []);

  return { containerRef, centerItem, resetScroll };
}
