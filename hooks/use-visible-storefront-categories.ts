"use client";

import { useEffect, useMemo, useState } from "react";

import { listPublicCategories, type PublicCategory } from "@/lib/supabase/public-catalog";

const CATEGORY_ROUTE_MATCHERS: Record<string, { slugs: string[]; names: string[] }> = {
  "/products/sim-cards": { slugs: ["sim-cards", "phone-cards", "international-phone-cards"], names: ["国际电话卡", "电话卡"] },
  "/products/gift-cards": { slugs: ["gift-cards", "gift-card", "recharge-card"], names: ["礼品卡", "充值卡"] },
  "/products/digital-accounts": { slugs: ["digital-accounts", "digital-account"], names: ["数字账号"] },
  "/products/ai-membership": { slugs: ["ai-membership", "ai-member", "ai-recharge"], names: ["ai", "会员"] },
  "/products/sms-code": { slugs: ["sms-code", "sms-codes"], names: ["接码服务", "接码"] },
};

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export function matchesVisibleStorefrontCategory(href: string, categories: PublicCategory[]) {
  const matcher = CATEGORY_ROUTE_MATCHERS[href];
  if (!matcher) return true;
  const slugs = new Set(matcher.slugs.map(normalize));
  const names = matcher.names.map(normalize);
  return categories.some((category) => {
    if (category.level !== 1) return false;
    const slug = normalize(category.slug);
    const name = normalize(category.name);
    return slugs.has(slug) || names.some((candidate) => candidate && name.includes(candidate));
  });
}

export function useVisibleStorefrontCategoryHrefs() {
  const [categories, setCategories] = useState<PublicCategory[] | null>(null);

  useEffect(() => {
    let mounted = true;
    void listPublicCategories()
      .then((rows) => mounted && setCategories(rows))
      .catch(() => mounted && setCategories([]));
    return () => { mounted = false; };
  }, []);

  return useMemo(() => {
    const visible = new Set<string>();
    if (!categories) return visible;
    Object.keys(CATEGORY_ROUTE_MATCHERS).forEach((href) => {
      if (matchesVisibleStorefrontCategory(href, categories)) visible.add(href);
    });
    return visible;
  }, [categories]);
}

export function isCatalogCategoryHref(href: string) {
  return Boolean(CATEGORY_ROUTE_MATCHERS[href]);
}
