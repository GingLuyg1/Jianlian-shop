"use client";

import { Children, ReactNode } from "react";
import { cn } from "@/lib/utils";

export default function CategoryContentBoundary({
  isLoading,
  children,
}: {
  isLoading: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative grid h-[calc(100dvh-87px)] min-h-0 grid-cols-1 items-stretch gap-5 overflow-hidden lg:grid-cols-[270px_minmax(0,1fr)]">
      {Children.map(children, (child, index) => (
        <div
          className={cn(
            "h-full min-h-0 transition-all duration-300 ease-out",
            isLoading ? "translate-y-1 opacity-45" : "translate-y-0 opacity-100"
          )}
          data-category-boundary-item={index}
        >
          {child}
        </div>
      ))}

      {isLoading ? (
        <div className="absolute inset-0 z-20 rounded-xl bg-white/70 backdrop-blur-sm">
          <div className="grid h-full min-h-0 grid-cols-1 gap-5 p-0 lg:grid-cols-[270px_minmax(0,1fr)]">
            <CategorySkeleton />
            <ProductSkeleton />
          </div>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-full border border-orange-100 bg-white/90 px-4 py-2 text-sm font-medium text-primary shadow-sm">
              正在加载商品...
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CategorySkeleton() {
  return (
    <div className="h-full min-h-0 rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex h-full min-h-0 flex-col rounded-xl bg-orange-50/35 p-3">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="flex h-[76px] items-center gap-3 rounded-xl border border-slate-100 bg-white px-4"
            >
              <div className="h-11 w-11 rounded-xl bg-slate-100" />
              <div className="h-4 w-28 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProductSkeleton() {
  return (
    <div className="h-full min-h-0 rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-4 h-32 rounded-lg bg-orange-50/60" />
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <div className="h-6 w-36 rounded bg-slate-100" />
          <div className="mt-2 h-3 w-24 rounded bg-slate-100" />
        </div>
        <div className="hidden h-11 w-[520px] rounded-lg bg-slate-100 md:block" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="flex h-[86px] items-center gap-5 rounded-xl bg-slate-50 px-5"
          >
            <div className="h-12 w-12 shrink-0 rounded-xl bg-slate-100" />
            <div className="min-w-0 flex-1">
              <div className="h-4 w-2/3 rounded bg-slate-100" />
              <div className="mt-2 h-3 w-1/3 rounded bg-slate-100" />
            </div>
            <div className="h-4 w-20 rounded bg-slate-100" />
            <div className="h-6 w-24 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
