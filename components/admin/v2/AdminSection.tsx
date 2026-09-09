import { ReactNode } from "react";

import { cn } from "@/lib/utils";

export default function AdminSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-[var(--admin-v2-surface-radius)] border border-[var(--admin-v2-border)] bg-[var(--admin-v2-surface)] shadow-none",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-6 text-[var(--admin-v2-text-primary)]">{title}</h2>
          {description ? <p className="mt-0.5 text-xs leading-[18px] text-[var(--admin-v2-text-muted)]">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
