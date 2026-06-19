"use client";

import { getCategoryPath } from "@/lib/catalog/category-tree";
import type { PublicCategory, PublicProductRow } from "@/lib/supabase/public-catalog";
import ProductCard from "./ProductCard";
import ProductEmptyState from "./ProductEmptyState";

export default function ProductGrid({
  categories,
  error,
  isLoading,
  onRetry,
  products,
}: {
  categories: PublicCategory[];
  error?: string;
  isLoading?: boolean;
  onRetry?: () => void;
  products: PublicProductRow[];
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="rounded-xl border bg-white p-4">
            <div className="aspect-square animate-pulse rounded-xl bg-slate-100" />
            <div className="mt-3 h-4 w-4/5 animate-pulse rounded bg-slate-100" />
            <div className="mt-2 h-3 w-3/5 animate-pulse rounded bg-slate-100" />
            <div className="mt-5 h-6 w-24 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <ProductEmptyState
        title="商品数据加载失败"
        description={error}
        onAction={onRetry}
      />
    );
  }

  if (products.length === 0) {
    return <ProductEmptyState title="该分类暂无商品" />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {products.map((product) => {
        const path = getCategoryPath(categories, product.category_id)
          .map((category) => category.name)
          .join(" / ");
        return <ProductCard key={product.id} product={product} categoryPath={path} />;
      })}
    </div>
  );
}
