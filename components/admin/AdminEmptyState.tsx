import { ReactNode } from "react";
import { Inbox } from "lucide-react";

import glass from "./v2/AdminPremiumGlass.module.css";
import { cn } from "@/lib/utils";

type AdminEmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export default function AdminEmptyState({
  icon,
  title,
  description,
  action,
  className,
}: AdminEmptyStateProps) {
  return (
    <div className={cn(glass.statePanel, "flex min-h-[220px] flex-1 flex-col items-center justify-center rounded-xl text-center", className)}>
      <div className={cn(glass.emptyIcon, "mb-3 flex h-11 w-11 items-center justify-center text-slate-500")}>
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      {description ? <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
