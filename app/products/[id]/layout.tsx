import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { buildPageMetadata, getSeoProduct, productJsonLd, SITE_NAME } from "@/lib/seo";

type ProductRouteProps = {
  children: React.ReactNode;
  params: { id: string };
};

type ProductRouteContext = {
  params: { id: string };
};

function isIndexableProduct(status: string) {
  return status === "active" || status === "sold_out";
}

export async function generateMetadata({ params }: ProductRouteContext): Promise<Metadata> {
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

export default async function ProductDetailLayout({ children, params }: ProductRouteProps) {
  const product = await getSeoProduct(params.id).catch(() => null);
  if (!product || !isIndexableProduct(product.status)) notFound();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productJsonLd(product)),
        }}
      />
      {children}
    </>
  );
}
