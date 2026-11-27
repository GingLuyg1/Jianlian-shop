"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type HoverMarqueeTextProps = {
  text: string;
  hovered?: boolean;
  enabled?: boolean;
  className?: string;
  /** Scroll speed in pixels per second (default 38px/s for smooth, readable motion) */
  speedPxPerSec?: number;
};

/**
 * 细腻的 PC 端截断文本悬停自动滚动组件：
 * - 未溢出时完全静止，与普通 truncate 文本一致；
 * - 发生截断且鼠标移入所属选项时，轻停 140ms 后按真实溢出像素柔和滚至末尾，短暂停顿后缓回起点循环；
 * - 鼠标移开时 300ms 丝滑回弹至起点并恢复省略号。
 */
export default function HoverMarqueeText({
  text,
  hovered = false,
  enabled = true,
  className,
  speedPxPerSec = 38,
}: HoverMarqueeTextProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [overflowPx, setOverflowPx] = useState(0);
  const [offsetPx, setOffsetPx] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [scrolling, setScrolling] = useState(false);

  useEffect(() => {
    if (!enabled || !hovered) {
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

    const travelPx = delta + 10;
    const forwardMs = Math.max(950, Math.min(4600, Math.round((travelPx / speedPxPerSec) * 1000)));
    const returnMs = Math.max(680, Math.round(forwardMs * 0.65));
    const endPauseMs = 720;
    const startPauseMs = 520;

    setOverflowPx(travelPx);
    let cancelled = false;
    const timers: Array<ReturnType<typeof setTimeout>> = [];

    const runCycle = (initialDelay: number) => {
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
          }, returnMs + 80);
          timers.push(t3);
        }, forwardMs + endPauseMs);
        timers.push(t2);
      }, initialDelay);
      timers.push(t1);
    };

    runCycle(140);

    return () => {
      cancelled = true;
      timers.forEach((id) => clearTimeout(id));
    };
  }, [enabled, hovered, speedPxPerSec, text]);

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
