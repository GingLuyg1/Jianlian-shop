"use client";

import { ChevronRight } from "lucide-react";
import type { PublicCategory } from "@/lib/supabase/public-catalog";
import { cn } from "@/lib/utils";

export default function CategoryBreadcrumb({
  className,
  items,
  onSelect,
}: {
  className?: string;
  items: PublicCategory[];
  onSelect?: (category: PublicCategory) => void;
}) {
  if (items.length === 0) return null;

  return (
    <nav
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground",
        className
      )}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <span key={item.id} className="inline-flex min-w-0 items-center gap-1">
            <button
              type="button"
              disabled={!onSelect || isLast}
              onClick={() => onSelect?.(item)}
              className={cn(
                "max-w-[160px] truncate rounded px-1.5 py-1 transition-colors",
                isLast
                  ? "cursor-default font-medium text-slate-700"
                  : "hover:bg-primary/10 hover:text-primary"
              )}
              title={item.name}
            >
              {item.name}
            </button>
            {!isLast ? <ChevronRight className="h-3.5 w-3.5" /> : null}
          </span>
        );
      })}
    </nav>
  );
}
