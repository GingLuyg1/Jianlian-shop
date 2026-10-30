"use client";

import { useMemo } from "react";

import { usePublicCategorySnapshot } from "@/lib/catalog/public-category-snapshot";
import { matchesVisibleStorefrontCategory, storefrontCategoryPaths } from "@/lib/catalog/visible-storefront-category-routes";
export { findVisibleStorefrontPrimaryCategory, isCatalogCategoryHref } from "@/lib/catalog/visible-storefront-category-routes";

export function useVisibleStorefrontCategoryHrefs() {
  const { rows, status } = usePublicCategorySnapshot();
  const visibleHrefs = useMemo(() => {
    const visible = new Set<string>();
    if (!rows) return visible;
    storefrontCategoryPaths.forEach((href) => {
      if (matchesVisibleStorefrontCategory(href, rows)) visible.add(href);
    });
    return visible;
  }, [rows]);
  return { status, visibleHrefs, confirmed: rows !== null, rows };
}
