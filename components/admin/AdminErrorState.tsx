import { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AdminErrorStateProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  onRetry?: () => void;
  className?: string;
};

export default function AdminErrorState({
  title = "数据加载失败",
  description = "请稍后重试",
  action,
  onRetry,
  className,
}: AdminErrorStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[220px] flex-1 flex-col items-center justify-center rounded-xl text-center",
        className
      )}
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-500">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      <div className="mt-4">
        {action ?? (onRetry ? <Button variant="outline" size="sm" onClick={onRetry}>重新加载</Button> : null)}
      </div>
    </div>
  );
}
