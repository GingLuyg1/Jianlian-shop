import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  buildPageMetadata,
  getSeoProduct,
  listSeoCategories,
  productBreadcrumbJsonLd,
  productJsonLd,
  type SeoCategory,
  SITE_NAME,
} from "@/lib/seo";

type ProductRouteProps = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

type ProductRouteContext = {
  params: Promise<{ id: string }>;
};

function isIndexableProduct(status: string) {
  return status === "active" || status === "sold_out";
}

export async function generateMetadata(props: ProductRouteContext): Promise<Metadata> {
  const params = await props.params;
  const product = await getSeoProduct(params.id).catch(() => null);
  if (!product || !isIndexableProduct(product.status)) {
    return buildPageMetadata({
      title: `商品不存在 | ${SITE_NAME}`,
      description: "商品不存在或已下架。",
      path: `/products/${params.id}`,
      noIndex: true,
    });
  }

  const title = `${product.name}${product.status === "sold_out" ? "（已售罄）" : ""}`;
  const description =
    product.short_description || product.description || `${product.name} - ${SITE_NAME} 数字商品服务`;

  return buildPageMetadata({
    title,
    description,
    path: `/products/${product.slug || product.id}`,
    image: product.image_url,
    noIndex: product.status !== "active",
  });
}

export default async function ProductDetailLayout(props: ProductRouteProps) {
  const params = await props.params;

  const {
    children
  } = props;

  const [product, categories] = await Promise.all([
    getSeoProduct(params.id).catch(() => null),
    listSeoCategories().catch(() => []),
  ]);
  if (!product || !isIndexableProduct(product.status)) notFound();

  let categoryPath = "";
  let primaryBreadcrumb: { name: string; path: string } | null = null;
  if (product.category_id && categories.length > 0) {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const chain: SeoCategory[] = [];
    let cursor = byId.get(product.category_id) ?? null;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      chain.unshift(cursor);
      cursor = cursor.parent_id ? byId.get(cursor.parent_id) ?? null : null;
    }
    if (chain.length > 0) {
      categoryPath = chain.map((c) => c.name).join(" / ");
      const rootSlug = chain[0].slug;
      const rootPathMap: Record<string, string> = {
        "digital-accounts": "/products/digital-accounts",
        "ai-membership": "/products/ai-membership",
        "gift-cards": "/products/gift-cards",
        "sim-cards": "/products/sim-cards",
        "account-recharge": "/products/account-recharge",
      };
      if (rootSlug && rootPathMap[rootSlug]) {
        primaryBreadcrumb = { name: chain[0].name, path: rootPathMap[rootSlug] };
      }
    }
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            productJsonLd(product, categoryPath),
            productBreadcrumbJsonLd(product, primaryBreadcrumb),
          ]),
        }}
      />
      {children}
    </>
  );
}
