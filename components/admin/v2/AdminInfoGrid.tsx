import { ReactNode } from "react";

import { cn } from "@/lib/utils";

const columnClasses = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 xl:grid-cols-3",
};

export function AdminInfoGrid({
  children,
  columns = 2,
  className,
}: {
  children: ReactNode;
  columns?: 2 | 3;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-1 px-4 pb-4 sm:px-5 sm:pb-5 [&>*]:border-t [&>*]:border-[var(--admin-v2-border)]",
        columnClasses[columns],
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function AdminInfoItem({
  label,
  value,
  secondary,
  mono = false,
  className,
}: {
  label: string;
  value: ReactNode;
  secondary?: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 py-3 sm:pr-6", className)}>
      <dt className="text-xs leading-[18px] text-[var(--admin-v2-text-muted)]">{label}</dt>
      <dd
        className={cn(
          "mt-1 min-w-0 text-sm font-medium leading-[22px] text-[var(--admin-v2-text-primary)] [overflow-wrap:anywhere]",
          mono && "font-mono text-xs leading-[18px]",
        )}
      >
        {value}
      </dd>
      {secondary ? <dd className="mt-0.5 text-xs leading-[18px] text-[var(--admin-v2-text-muted)] [overflow-wrap:anywhere]">{secondary}</dd> : null}
    </div>
  );
}
