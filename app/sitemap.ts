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
  { path: "/products/sim-cards", changeFrequency: "weekly", priority: 0.85 },
  { path: "/products/account-recharge", changeFrequency: "weekly", priority: 0.75 },
  { path: "/tutorials", changeFrequency: "weekly", priority: 0.8 },
  { path: "/faq", changeFrequency: "weekly", priority: 0.7 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([
    listSeoProductSitemapEntries().catch(() => []),
    listSeoCategories().catch(() => []),
  ]);

  // 仅包含有效且父级未停用的分类（若分类表可用）
  const activeCategoryIds = new Set<string>();
  if (categories.length > 0) {
    const byId = new Map(categories.map((c) => [c.id, c]));
    for (const c of categories) {
      if (c.is_active === false) continue;
      if (c.parent_id && !byId.has(c.parent_id)) continue;
      activeCategoryIds.add(c.id);
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
