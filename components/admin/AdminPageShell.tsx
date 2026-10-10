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
      <header className="mb-4 flex shrink-0 flex-col items-start justify-between gap-3 sm:flex-row sm:gap-4">
        <div className="min-w-0">
          <h1 className={cn("break-words text-2xl font-semibold text-slate-950 sm:truncate", isV2 && "text-xl leading-7 text-[var(--admin-v2-text-primary)] sm:text-2xl sm:leading-8")}>{title}</h1>
          {description ? (
            <p className={cn("mt-1 text-sm text-slate-500", isV2 && "leading-5 text-[var(--admin-v2-text-muted)]")}>{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}</div> : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </section>
  );
}
