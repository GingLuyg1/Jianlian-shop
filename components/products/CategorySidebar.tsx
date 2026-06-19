"use client";

import { ChevronRight, FolderTree } from "lucide-react";
import type { PublicCategory } from "@/lib/supabase/public-catalog";
import { cn } from "@/lib/utils";

type CategoryNode = PublicCategory & {
  children: CategoryNode[];
  displayImage?: string;
};

export default function CategorySidebar({
  categories,
  disabled,
  selectedCategoryId,
  onSelectCategory,
}: {
  categories: CategoryNode[];
  disabled?: boolean;
  selectedCategoryId?: string;
  onSelectCategory: (category: PublicCategory) => void;
}) {
  return (
    <div className="h-full min-h-0 overflow-hidden rounded-xl border bg-white">
      <div className="h-full min-h-0 overflow-y-auto p-4">
        {categories.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-slate-50 p-5 text-center text-sm text-muted-foreground">
            暂无可用分类
          </div>
        ) : (
          <div className="space-y-2">
            {categories.map((category) => (
              <CategoryTreeItem
                key={category.id}
                category={category}
                disabled={disabled}
                selectedCategoryId={selectedCategoryId}
                onSelectCategory={onSelectCategory}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryTreeItem({
  category,
  depth = 0,
  disabled,
  selectedCategoryId,
  onSelectCategory,
}: {
  category: CategoryNode;
  depth?: number;
  disabled?: boolean;
  selectedCategoryId?: string;
  onSelectCategory: (category: PublicCategory) => void;
}) {
  const active = selectedCategoryId === category.id;

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelectCategory(category)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition disabled:cursor-wait",
          active
            ? "border-primary/25 bg-primary/10 text-primary shadow-sm"
            : "border-slate-100 bg-white text-slate-700 hover:border-primary/25 hover:bg-primary/5"
        )}
        style={{ paddingLeft: 12 + depth * 18 }}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {category.displayImage ? (
            <img
              src={category.displayImage}
              alt=""
              className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-slate-200"
            />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <FolderTree className="h-4 w-4 text-primary" />
            </span>
          )}
          <span className="truncate text-sm font-semibold" title={category.name}>
            {category.name}
          </span>
        </span>
        {category.children.length > 0 ? (
          <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
        ) : null}
      </button>

      {category.children.length > 0 ? (
        <div className="space-y-1">
          {category.children.map((child) => (
            <CategoryTreeItem
              key={child.id}
              category={child}
              depth={depth + 1}
              disabled={disabled}
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={onSelectCategory}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
