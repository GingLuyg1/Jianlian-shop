"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import styles from "./RefinedLoadingOrb.module.css";

export default function RefinedLoadingOrb({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  const gradId = useId();
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="refined-loading-orb"
      className={cn(styles.root, className)}
    >
      <div className={styles.orbStage} aria-hidden="true">
        <span className={styles.halo} />
        <svg viewBox="0 0 44 44" className={styles.svg}>
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="55%" stopColor="#ea580c" />
              <stop offset="100%" stopColor="#c2410c" />
            </linearGradient>
          </defs>
          <circle cx="22" cy="22" r="17" className={styles.track} />
          <g className={styles.outerSpin}>
            <circle
              cx="22"
              cy="22"
              r="17"
              className={styles.outerArc}
              stroke={`url(#${gradId})`}
            />
          </g>
          <g className={styles.innerSpin}>
            <circle cx="22" cy="22" r="11" className={styles.innerArc} />
          </g>
          <circle cx="22" cy="22" r="2.4" className={styles.coreDot} />
        </svg>
      </div>
      {label ? <span className={styles.label}>{label}</span> : null}
    </div>
  );
}
