"use client";

import { getStockLabel, normalizeProductStatus } from "@/lib/catalog/product-status";
import { cn } from "@/lib/utils";

export default function ProductStatusBadge({
  status,
  stock,
}: {
  status: string;
  stock: number;
}) {
  const normalized = normalizeProductStatus(status);
  const label = getStockLabel({ status, stock });
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center justify-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium",
        normalized === "sold_out" || stock <= 0
          ? "bg-slate-100 text-slate-500"
          : "bg-green-50 text-green-700"
      )}
    >
      {label}
    </span>
  );
}
