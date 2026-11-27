"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type HoverMarqueeTextProps = {
  text: string;
  hovered?: boolean;
  /** When true (e.g. mobile), truncated text auto-scrolls slowly without needing hover */
  autoScroll?: boolean;
  enabled?: boolean;
  className?: string;
  /** Scroll speed in pixels per second (PC hover default 38px/s; mobile autoScroll uses gentler pace) */
  speedPxPerSec?: number;
};

/**
 * 细腻的截断文本自动滚动组件：
 * - 未发生截断溢出时完全静止，与普通 truncate 文本一致；
 * - PC 端鼠标移入所属选项卡片/行时，轻停 140ms 后按真实溢出像素柔和滚至末尾，短暂停顿后缓回起点循环；
 * - 手机端开启 autoScroll 时，若文字被截断则自动以更温和的速度缓慢循环滚动，无需悬停；
 * - 滚动期间边缘带柔光透明羽化遮罩，停止时 300ms 丝滑回弹至起点恢复省略号。
 */
export default function HoverMarqueeText({
  text,
  hovered = false,
  autoScroll = false,
  enabled = true,
  className,
  speedPxPerSec,
}: HoverMarqueeTextProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [overflowPx, setOverflowPx] = useState(0);
  const [offsetPx, setOffsetPx] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [scrolling, setScrolling] = useState(false);

  const shouldRun = enabled && (hovered || autoScroll);
  const effectiveSpeed = speedPxPerSec ?? (autoScroll && !hovered ? 24 : 38);

  useEffect(() => {
    if (!shouldRun) {
      setScrolling(false);
      setDurationMs(300);
      setOffsetPx(0);
      return;
    }

    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let cancelled = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];

    const startMeasurementAndCycle = () => {
      if (cancelled) return;
      const box = containerRef.current;
      const inner = measureRef.current;
      if (!box || !inner) return;

      const delta = Math.ceil(inner.scrollWidth - box.clientWidth);
      if (delta <= 2) {
        setOverflowPx(0);
        setScrolling(false);
        setOffsetPx(0);
        return;
      }

      const travelPx = delta + 12;
      const forwardMs = Math.max(
        autoScroll && !hovered ? 1600 : 950,
        Math.min(autoScroll && !hovered ? 7500 : 4800, Math.round((travelPx / effectiveSpeed) * 1000))
      );
      const returnMs = Math.max(760, Math.round(forwardMs * 0.68));
      const endPauseMs = autoScroll && !hovered ? 1100 : 720;
      const startPauseMs = autoScroll && !hovered ? 1200 : 520;
      const initialDelay = autoScroll && !hovered ? 750 : 140;

      setOverflowPx(travelPx);

      const runCycle = (delay: number) => {
        const t1 = setTimeout(() => {
          if (cancelled) return;
          setScrolling(true);
          setDurationMs(forwardMs);
          setOffsetPx(travelPx);

          const t2 = setTimeout(() => {
            if (cancelled) return;
            setDurationMs(returnMs);
            setOffsetPx(0);

            const t3 = setTimeout(() => {
              if (cancelled) return;
              runCycle(startPauseMs);
            }, returnMs + 100);
            timers.push(t3);
          }, forwardMs + endPauseMs);
          timers.push(t2);
        }, delay);
        timers.push(t1);
      };

      runCycle(initialDelay);
    };

    const rafId = window.requestAnimationFrame(startMeasurementAndCycle);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
      timers.forEach((id) => clearTimeout(id));
    };
  }, [autoScroll, effectiveSpeed, hovered, shouldRun, text]);

  const showMask = scrolling && overflowPx > 0;

  return (
    <span
      ref={containerRef}
      title={text}
      className={cn("block min-w-0 flex-1 overflow-hidden whitespace-nowrap", !showMask && "truncate", className)}
      style={
        showMask
          ? {
              maskImage: "linear-gradient(90deg, transparent 0%, #000 7%, #000 91%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(90deg, transparent 0%, #000 7%, #000 91%, transparent 100%)",
            }
          : undefined
      }
    >
      <span
        ref={measureRef}
        className="inline-block will-change-transform"
        style={{
          transform: offsetPx > 0 ? `translate3d(-${offsetPx}px, 0, 0)` : "translate3d(0, 0, 0)",
          transitionProperty: "transform",
          transitionDuration: `${durationMs}ms`,
          transitionTimingFunction: offsetPx > 0 ? "cubic-bezier(0.37, 0, 0.63, 1)" : "cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {text}
      </span>
    </span>
  );
}
