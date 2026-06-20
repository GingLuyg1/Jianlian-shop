import { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AdminPageShellProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export default function AdminPageShell({
  title,
  description,
  actions,
  children,
  className,
}: AdminPageShellProps) {
  return (
    <section className={cn("flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-3 pt-3 lg:px-5 lg:pb-4 lg:pt-4", className)}>
      <header className="mb-3 flex shrink-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold text-slate-950">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </section>
  );
}
