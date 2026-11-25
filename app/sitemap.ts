import type { MetadataRoute } from "next";

import { listSeoCategories, listSeoProductSitemapEntries, SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";

const staticRoutes: Array<{
  path: string;
  changeFrequency: "daily" | "weekly";
  priority: number;
}> = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/products/digital-accounts", changeFrequency: "daily", priority: 0.9 },
  { path: "/products/ai-membership", changeFrequency: "daily", priority: 0.9 },
  { path: "/products/gift-cards", changeFrequency: "daily", priority: 0.85 },
  { path: "/products/sim-cards", changeFrequency: "weekly", priority: 0.8 },
  { path: "/products/account-recharge", changeFrequency: "weekly", priority: 0.75 },
  { path: "/tutorials", changeFrequency: "weekly", priority: 0.8 },
  { path: "/terms", changeFrequency: "weekly", priority: 0.4 },
  { path: "/privacy", changeFrequency: "weekly", priority: 0.4 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([
    listSeoProductSitemapEntries().catch(() => []),
    listSeoCategories().catch(() => []),
  ]);

  // Walk full ancestor chain so disabled root/parent hides 2nd & 3rd level descendants.
  const activeCategoryIds = new Set<string>();
  if (categories.length > 0) {
    const byId = new Map(categories.map((c) => [c.id, c]));
    for (const c of categories) {
      let cursor: typeof c | undefined = c;
      const seen = new Set<string>();
      let ok = true;
      while (cursor && !seen.has(cursor.id)) {
        seen.add(cursor.id);
        if (cursor.is_active === false) {
          ok = false;
          break;
        }
        if (cursor.parent_id) {
          cursor = byId.get(cursor.parent_id);
          if (!cursor) {
            ok = false;
            break;
          }
        } else {
          break;
        }
      }
      if (ok) activeCategoryIds.add(c.id);
    }
  }

  const latestProductDate = products[0]?.updated_at
    ? new Date(products[0].updated_at)
    : new Date();

  const routes: MetadataRoute.Sitemap = staticRoutes.map((item) => ({
    url: `${SITE_URL}${item.path}`,
    lastModified: latestProductDate,
    changeFrequency: item.changeFrequency,
    priority: item.priority,
  }));

  const seenUrls = new Set(routes.map((r) => r.url));

  for (const product of products) {
    if (
      activeCategoryIds.size > 0 &&
      product.category_id &&
      !activeCategoryIds.has(product.category_id)
    ) {
      continue;
    }
    const slug = product.slug || product.id;
    if (!slug) continue;
    const url = `${SITE_URL}/products/${encodeURIComponent(slug)}`;
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    routes.push({
      url,
      lastModified: product.updated_at ? new Date(product.updated_at) : latestProductDate,
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  return routes;
}
