"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface SlidingIndicatorStyle {
  left: number;
  width: number;
  visible: boolean;
  animated: boolean;
}

/**
 * 精准 DOM 测量的横向滑动胶囊指示器 Hook。
 * 自动适配动态文字长度、数字徽章增减与窗口缩放，彻底杜绝百分比硬编码导致的滑块错位或裁切。
 */
export function useSlidingIndicator<T extends string>(
  activeKey: T | null | undefined,
  extraDeps: readonly unknown[] = []
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLElement | null>>({});
  const hasPlacedRef = useRef(false);
  const [indicator, setIndicator] = useState<SlidingIndicatorStyle>({
    left: 0,
    width: 0,
    visible: false,
    animated: false,
  });

  const setItemRef = useCallback((key: T) => {
    return (el: HTMLElement | null) => {
      itemRefs.current[key] = el;
    };
  }, []);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container || !activeKey) {
      setIndicator((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }
    const target = itemRefs.current[activeKey];
    if (!target) {
      setIndicator((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }
    const left = target.offsetLeft;
    const width = target.offsetWidth;
    if (width <= 0) return;

    const alreadyPlaced = hasPlacedRef.current;
    hasPlacedRef.current = true;
    setIndicator((prev) => {
      if (
        prev.visible &&
        Math.abs(prev.left - left) < 0.5 &&
        Math.abs(prev.width - width) < 0.5 &&
        prev.animated === alreadyPlaced
      ) {
        return prev;
      }
      return { left, width, visible: true, animated: alreadyPlaced };
    });
  }, [activeKey]);

  useIsomorphicLayoutEffect(() => {
    measure();
    const container = containerRef.current;
    if (!container) return;

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(container);
      Object.values(itemRefs.current).forEach((el) => {
        if (el) ro?.observe(el);
      });
    }
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, ...extraDeps]);

  return { containerRef, setItemRef, indicator, measure };
}
