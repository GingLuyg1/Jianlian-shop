import type { MetadataRoute } from "next";

import { listSeoProducts, SITE_URL } from "@/lib/seo";

const staticRoutes = [
  "/",
  "/products/digital-accounts",
  "/products/ai-membership",
  "/products/gift-cards",
  "/products/sim-cards",
  "/products/sms-code",
  "/products/account-recharge",
  "/faq",
  "/tutorials",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const routes: MetadataRoute.Sitemap = staticRoutes.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1 : 0.75,
  }));

  const products = await listSeoProducts().catch(() => []);
  for (const product of products) {
    const slug = product.slug || product.id;
    if (!slug) continue;
    routes.push({
      url: `${SITE_URL}/products/${encodeURIComponent(slug)}`,
      lastModified: product.updated_at ? new Date(product.updated_at) : now,
      changeFrequency: "weekly",
      priority: 0.65,
    });
  }

  return routes;
}
