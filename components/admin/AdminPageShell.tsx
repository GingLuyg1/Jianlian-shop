import { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AdminPageShellProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  variant?: "default" | "v2";
};

export default function AdminPageShell({
  title,
  description,
  actions,
  children,
  className,
  variant = "default",
}: AdminPageShellProps) {
  const isV2 = variant === "v2";
  return (
    <section className={cn("flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden px-4 py-3 lg:[padding-inline:var(--admin-content-padding-x)] lg:py-4", className)}>
      <header className={cn("mb-4 flex shrink-0 items-start justify-between gap-4", isV2 && "flex-col sm:flex-row")}>
        <div className="min-w-0">
          <h1 className={cn("truncate text-2xl font-semibold text-slate-950", isV2 && "text-xl leading-7 text-[var(--admin-v2-text-primary)] sm:text-2xl sm:leading-8")}>{title}</h1>
          {description ? (
            <p className={cn("mt-1 text-sm text-slate-500", isV2 && "leading-5 text-[var(--admin-v2-text-muted)]")}>{description}</p>
          ) : null}
        </div>
        {actions ? <div className={cn("flex shrink-0 items-center gap-2", isV2 && "w-full sm:w-auto sm:justify-end")}>{actions}</div> : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </section>
  );
}
