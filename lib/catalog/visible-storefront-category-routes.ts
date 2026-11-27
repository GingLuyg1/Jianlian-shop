import type { PublicCategory } from "@/lib/supabase/public-catalog";

const CATEGORY_ROUTE_MATCHERS: Record<string, { slugs: string[]; names: string[] }> = {
  "/products/sim-cards": { slugs: ["sim-cards", "phone-cards", "international-phone-cards"], names: ["国际电话卡", "电话卡", "国际sim卡", "sim卡", "sim"] },
  "/products/gift-cards": { slugs: ["gift-cards", "gift-card", "recharge-card"], names: ["礼品卡", "充值卡"] },
  "/products/digital-accounts": { slugs: ["digital-accounts", "digital-account"], names: ["数字账号", "社媒账号", "数字/社媒", "数字"] },
  "/products/ai-membership": { slugs: ["ai-membership", "ai-member", "ai-recharge"], names: ["ai", "会员"] },
};

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export function findVisibleStorefrontPrimaryCategory(href: string, categories: PublicCategory[]) {
  const matcher = CATEGORY_ROUTE_MATCHERS[href];
  if (!matcher) return undefined;
  const slugs = new Set(matcher.slugs.map(normalize));
  const names = matcher.names.map(normalize);
  return categories.find((category) => {
    if (category.level !== 1) return false;
    const slug = normalize(category.slug);
    const name = normalize(category.name);
    return slugs.has(slug) || names.some((candidate) => candidate && name.includes(candidate));
  });
}

export function matchesVisibleStorefrontCategory(href: string, categories: PublicCategory[]) {
  if (!CATEGORY_ROUTE_MATCHERS[href]) return true;
  return Boolean(findVisibleStorefrontPrimaryCategory(href, categories));
}

export function isCatalogCategoryHref(href: string) {
  return Boolean(CATEGORY_ROUTE_MATCHERS[href]);
}

export const storefrontCategoryPaths = Object.keys(CATEGORY_ROUTE_MATCHERS);

export function sortStorefrontCategoryItems<T extends { href: string }>(
  items: T[],
  categories: PublicCategory[] | null | undefined
): T[] {
  if (!categories || categories.length === 0) return items;
  const rankByHref = new Map<string, number>();
  for (const href of storefrontCategoryPaths) {
    const primary = findVisibleStorefrontPrimaryCategory(href, categories);
    if (primary) {
      const order = Number(primary.sort_order);
      rankByHref.set(href, Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER);
    }
  }
  if (rankByHref.size === 0) return items;

  const catalogSlots: number[] = [];
  const catalogEntries: Array<{ item: T; rank: number; originalIndex: number }> = [];
  items.forEach((item, index) => {
    if (isCatalogCategoryHref(item.href)) {
      catalogSlots.push(index);
      catalogEntries.push({
        item,
        rank: rankByHref.get(item.href) ?? Number.MAX_SAFE_INTEGER,
        originalIndex: index,
      });
    }
  });
  if (catalogEntries.length <= 1) return items;

  catalogEntries.sort((a, b) => a.rank - b.rank || a.originalIndex - b.originalIndex);
  const result = [...items];
  catalogSlots.forEach((slotIndex, i) => {
    result[slotIndex] = catalogEntries[i].item;
  });
  return result;
}
