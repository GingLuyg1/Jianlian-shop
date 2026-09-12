"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AdminListStats({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 grid shrink-0 overflow-hidden rounded-[var(--admin-v2-surface-radius)] border border-[var(--admin-v2-border)] bg-[var(--admin-v2-surface)] sm:grid-cols-2 xl:grid-cols-4", className)}>
      {children}
    </div>
  );
}

export function AdminListStat({
  label,
  value,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: ReactNode;
  tone?: "neutral" | "warning";
  icon?: ReactNode;
}) {
  return (
    <div className={cn("min-w-0 border-b border-[var(--admin-v2-border)] px-4 py-3 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0", tone === "warning" && "bg-[var(--admin-v2-warning-background)]")}>
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-[var(--admin-v2-text-muted)]">
        <span>{label}</span>{icon ? <span className="shrink-0">{icon}</span> : null}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-[var(--admin-v2-text-primary)]">{value}</div>
    </div>
  );
}

export function AdminListSurface({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--admin-v2-surface-radius)] border border-[var(--admin-v2-border)] bg-[var(--admin-v2-surface)] shadow-none", className)}>
      {children}
    </section>
  );
}

export function AdminFilterBar({
  primary,
  advanced,
  children,
  className,
}: {
  primary?: ReactNode;
  advanced?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="shrink-0 border-b border-[var(--admin-v2-border)] px-3 py-2.5 sm:px-4">
      <div className={cn("grid items-center gap-2", className)}>
        {children ?? primary}
        {advanced ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="h-11 justify-between sm:h-9 lg:hidden"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              <span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" />更多筛选</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
            </Button>
            <div className={cn("contents", !expanded && "hidden lg:contents")}>{advanced}</div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function AdminTableViewport({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("min-h-0 flex-1 overflow-x-auto overflow-y-auto", className)}>{children}</div>;
}

export function AdminListPagination({
  summary,
  page,
  totalPages,
  loading = false,
  onPrevious,
  onNext,
  leading,
}: {
  summary: ReactNode;
  page: number;
  totalPages: number;
  loading?: boolean;
  onPrevious: () => void;
  onNext: () => void;
  leading?: ReactNode;
}) {
  return (
    <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--admin-v2-border)] px-3 py-2 text-sm text-[var(--admin-v2-text-muted)] sm:px-4">
      <span>{summary}</span>
      <div className="flex items-center gap-2">
        {leading}
        <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" disabled={page <= 1 || loading} onClick={onPrevious}>上一页</Button>
        <span className="whitespace-nowrap tabular-nums">第 {page} / {totalPages} 页</span>
        <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" disabled={page >= totalPages || loading} onClick={onNext}>下一页</Button>
      </div>
    </div>
  );
}

export const adminListControlClass = "h-11 min-w-0 rounded-[var(--admin-v2-control-radius)] border-[var(--admin-v2-border)] bg-white text-sm shadow-none focus-visible:ring-2 focus-visible:ring-[var(--admin-v2-primary)] sm:h-9";
export const adminListTableClass = "w-full table-fixed text-sm";
export const adminListTableHeadClass = "sticky top-0 z-10 bg-[var(--admin-v2-surface-muted)] text-left text-xs font-medium text-[var(--admin-v2-text-muted)]";
export const adminListRowClass = "h-12 border-b border-[var(--admin-v2-border)] bg-white hover:bg-slate-50/70";
