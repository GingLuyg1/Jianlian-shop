import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type TrendValue = number | null;

type MetricCardBaseProps = {
  label: string;
  value: string;
  description: string;
  comparison?: string | null;
  href?: string;
  loading?: boolean;
};

type AdminMetricTrendCardProps = MetricCardBaseProps & {
  trend: TrendValue[];
};

type AdminMetricValueCardProps = MetricCardBaseProps & {
  tone?: "neutral" | "warning" | "danger";
  compact?: boolean;
};

function metricSurfaceClassName(interactive: boolean, compact = false) {
  return cn(
    "block min-w-0 bg-[var(--admin-v2-surface)] shadow-none",
    compact ? "h-full" : "rounded-[var(--admin-v2-surface-radius)] border border-[var(--admin-v2-border)]",
    interactive && "group transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-v2-primary)] focus-visible:ring-offset-2",
    interactive && (compact ? "hover:bg-[var(--admin-v2-selected)]" : "hover:border-blue-300"),
  );
}

function MetricSurface({ href, children, compact = false }: { href?: string; children: ReactNode; compact?: boolean }) {
  if (href) {
    return (
      <Link href={href} className={metricSurfaceClassName(true, compact)}>
        {children}
      </Link>
    );
  }

  return <div className={metricSurfaceClassName(false, compact)}>{children}</div>;
}

export function AdminMetricTrendCard({
  label,
  value,
  description,
  comparison,
  href,
  loading = false,
  trend,
}: AdminMetricTrendCardProps) {
  return (
    <MetricSurface href={href}>
      <div className="flex min-h-[112px] flex-col px-3 py-2.5 sm:px-3.5">
        <div className="truncate text-xs leading-[18px] text-[var(--admin-v2-text-muted)]">{label}</div>
        <div className="mt-1 truncate text-[22px] font-semibold leading-7 tracking-tight text-[var(--admin-v2-text-primary)]">
          {loading ? "..." : value}
        </div>
        <div className="mt-auto grid min-w-0 grid-cols-[minmax(0,1fr)_72px] items-end gap-2 pt-2">
          <div className="min-w-0 text-[11px] leading-4 text-[var(--admin-v2-text-muted)]">
            <div className="truncate">{comparison || "暂无对比"}</div>
            <div className="truncate">{description}</div>
          </div>
          <AdminMiniTrendChart values={trend} label={label} loading={loading} />
        </div>
      </div>
    </MetricSurface>
  );
}

export function AdminMetricValueCard({
  label,
  value,
  description,
  comparison,
  href,
  loading = false,
  tone = "neutral",
  compact = false,
}: AdminMetricValueCardProps) {
  const dotTone = {
    neutral: "bg-slate-300",
    warning: "bg-amber-500",
    danger: "bg-red-500",
  }[tone];

  return (
    <MetricSurface href={href} compact={compact}>
      <div className={cn("flex flex-col justify-between px-3 py-2.5 sm:px-3.5", compact ? "min-h-[68px]" : "min-h-[92px]")}>
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotTone)} aria-hidden="true" />
          <div className="truncate text-xs leading-[18px] text-[var(--admin-v2-text-muted)]">{label}</div>
        </div>
        <div className={cn("mt-0.5 truncate font-semibold text-[var(--admin-v2-text-primary)]", compact ? "text-lg leading-6" : "text-xl leading-7")}>
          {loading ? "..." : value}
        </div>
        <div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-[11px] leading-4 text-[var(--admin-v2-text-muted)]">
          <span className="truncate">{description}</span>
          {comparison ? <span className="shrink-0">{comparison}</span> : null}
        </div>
      </div>
    </MetricSurface>
  );
}

export function AdminMiniTrendChart({
  values,
  label,
  loading = false,
}: {
  values: TrendValue[];
  label: string;
  loading?: boolean;
}) {
  if (loading) {
    return <div className="h-10 w-[72px] animate-pulse rounded bg-[var(--admin-v2-surface-muted)]" />;
  }

  const finiteValues = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (finiteValues.length < 2) {
    return (
      <div className="flex h-10 w-[72px] items-end justify-end text-[10px] text-[var(--admin-v2-text-muted)]">
        暂无趋势
      </div>
    );
  }

  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  const range = max - min || 1;
  const width = 72;
  const height = 40;
  const padding = 3;
  const xStep = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;
  const points = values.map((value, index) => {
    if (value === null || !Number.isFinite(value)) return null;
    return {
      x: padding + index * xStep,
      y: height - padding - ((value - min) / range) * (height - padding * 2),
    };
  });
  const paths: string[] = [];
  let currentPath = "";
  points.forEach((point) => {
    if (!point) {
      if (currentPath) paths.push(currentPath);
      currentPath = "";
      return;
    }
    currentPath += `${currentPath ? " L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  });
  if (currentPath) paths.push(currentPath);
  const lastPoint = [...points].reverse().find((point) => point !== null);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-10 w-[72px] overflow-visible"
      role="img"
      aria-label={`${label}近 7 天趋势`}
    >
      <path d={`M${padding} ${height - padding} H${width - padding}`} fill="none" stroke="#dbeafe" strokeWidth="1" />
      {paths.map((path, index) => (
        <path key={index} d={path} fill="none" stroke="var(--admin-v2-primary)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
      ))}
      {lastPoint ? <circle cx={lastPoint.x} cy={lastPoint.y} r="2.25" fill="var(--admin-v2-primary)" /> : null}
    </svg>
  );
}
