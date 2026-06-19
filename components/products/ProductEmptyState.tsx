"use client";

import { PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ProductEmptyState({
  actionLabel = "重新加载",
  description = "可以调整搜索词、筛选条件或切换分类后再试。",
  onAction,
  title = "暂无商品",
}: {
  actionLabel?: string;
  description?: string;
  onAction?: () => void;
  title?: string;
}) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed bg-slate-50/70 px-6 text-center">
      <PackageSearch className="h-10 w-10 text-primary/70" />
      <div className="mt-4 text-base font-semibold text-slate-900">{title}</div>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {onAction ? (
        <Button type="button" variant="outline" className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
