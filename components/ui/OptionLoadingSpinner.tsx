"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import styles from "./OptionLoadingSpinner.module.css";

type Phase = "hidden" | "entering" | "loading" | "completing" | "leaving";

const MIN_ACTIVE_MS = 280;
const COMPLETE_HOLD_MS = 130;
const EXIT_DURATION_MS = 190;

export default function OptionLoadingSpinner({
  active,
  size = "md",
  className,
}: {
  active: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const [phase, setPhase] = useState<Phase>(active ? "entering" : "hidden");
  const [progress, setProgress] = useState(active ? 16 : 0);
  const startedAtRef = useRef<number>(active ? Date.now() : 0);
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;

  useEffect(() => {
    let enterTimer: number | null = null;
    let progressTimer: number | null = null;
    let minWaitTimer: number | null = null;
    let completeTimer: number | null = null;
    let leaveTimer: number | null = null;

    if (active) {
      startedAtRef.current = Date.now();
      setProgress(16);
      setPhase("entering");

      enterTimer = window.setTimeout(() => {
        setPhase("loading");
      }, 200);

      progressTimer = window.setInterval(() => {
        setProgress((prev) => {
          if (prev >= 88) return prev;
          const step = Math.max(1.8, (88 - prev) * 0.16);
          return Math.min(88, Number((prev + step).toFixed(1)));
        });
      }, 95);
    } else if (phaseRef.current !== "hidden") {
      const elapsed = Date.now() - startedAtRef.current;
      const remainingMin = Math.max(0, MIN_ACTIVE_MS - elapsed);

      const finishSequence = () => {
        setProgress(100);
        setPhase("completing");
        completeTimer = window.setTimeout(() => {
          setPhase("leaving");
          leaveTimer = window.setTimeout(() => {
            setPhase("hidden");
            setProgress(0);
          }, EXIT_DURATION_MS);
        }, COMPLETE_HOLD_MS);
      };

      if (remainingMin > 0) {
        minWaitTimer = window.setTimeout(finishSequence, remainingMin);
      } else {
        finishSequence();
      }
    }

    return () => {
      if (enterTimer) window.clearTimeout(enterTimer);
      if (progressTimer) window.clearInterval(progressTimer);
      if (minWaitTimer) window.clearTimeout(minWaitTimer);
      if (completeTimer) window.clearTimeout(completeTimer);
      if (leaveTimer) window.clearTimeout(leaveTimer);
    };
  }, [active]);

  if (phase === "hidden") return null;

  const pixelSize = size === "sm" ? 15 : 18;
  const strokeWidth = size === "sm" ? 2.1 : 2.3;
  const radius = (pixelSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (Math.min(100, Math.max(8, progress)) / 100) * circumference;
  const spinArcLength = circumference * 0.28;

  return (
    <span
      role="status"
      aria-label={`正在加载 ${Math.round(progress)}%`}
      data-option-spinner={phase}
      className={cn(
        styles.wrapper,
        phase === "entering" && styles.entering,
        phase === "loading" && styles.loading,
        phase === "completing" && styles.completing,
        phase === "leaving" && styles.leaving,
        className
      )}
    >
      <svg
        width={pixelSize}
        height={pixelSize}
        viewBox={`0 0 ${pixelSize} ${pixelSize}`}
        className={styles.svg}
      >
        {/* Background circular track */}
        <circle
          cx={pixelSize / 2}
          cy={pixelSize / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className={styles.track}
        />
        {/* Determinate progress arc (0% -> 88% -> 100%) */}
        <circle
          cx={pixelSize / 2}
          cy={pixelSize / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={styles.progressRing}
        />
        {/* Indeterminate spinning active arc */}
        <circle
          cx={pixelSize / 2}
          cy={pixelSize / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={`${spinArcLength} ${circumference}`}
          strokeDashoffset={0}
          className={styles.spinArc}
        />
      </svg>
    </span>
  );
}
