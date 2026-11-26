import "server-only";

import { cache } from "react";
import type { Metadata } from "next";

import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { isPreorderDeliveryMode } from "@/lib/products/delivery-and-stock";

export const SITE_URL = "https://www.jianlian.shop";
export const SITE_NAME = "Jianlian Shop";
export const SITE_DESCRIPTION =
  "轻松连接全球数字生活。Jianlian Shop 为您提供 AI 会员、精选数字账号与全球礼品卡服务，让每一次数字探索都简单、即时。";
export const DEFAULT_OG_IMAGE = "/assets/og-cover.png";

export type SeoProduct = {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  image_url: string | null;
  price: number;
  original_price: number | null;
  stock: number;
  has_skus?: boolean | null;
  delivery_type?: string | null;
  metadata?: Record<string, unknown> | null;
  status: string;
  updated_at: string | null;
  category_id: string | null;
  effective_stock?: number;
  is_preorder?: boolean;
};

export type SeoCategory = {
  id: string;
  parent_id: string | null;
  level: number;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean | null;
  updated_at: string | null;
};

export function absoluteUrl(pathOrUrl: string | null | undefined) {
  const value = pathOrUrl?.trim();
  if (!value) return `${SITE_URL}${DEFAULT_OG_IMAGE}`;
  if (/^https?:\/\//i.test(value)) return value;
  return `${SITE_URL}${value.startsWith("/") ? value : `/${value}`}`;
}

export function buildPageMetadata(input: {
  title: string;
  description?: string | null;
  path?: string;
  image?: string | null;
  noIndex?: boolean;
}): Metadata {
  const rawDescription = (input.description?.trim() || SITE_DESCRIPTION)
    .replace(/\s+/g, " ")
    .slice(0, 160);
  const url = input.path === "./" ? "./" : absoluteUrl(input.path || "/");
  const isDefaultOg = !input.image || input.image.trim() === DEFAULT_OG_IMAGE;
  const image = absoluteUrl(input.image || DEFAULT_OG_IMAGE);
  const formattedTitle =
    input.title.includes(SITE_NAME) ? input.title : `${input.title} | ${SITE_NAME}`;

  return {
    metadataBase: new URL(SITE_URL),
    title: { absolute: formattedTitle },
    description: rawDescription,
    alternates: { canonical: url },
    robots: input.noIndex
      ? { index: false, follow: false, nocache: true }
      : { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      title: formattedTitle,
      description: rawDescription,
      url: url === "./" ? SITE_URL : url,
      siteName: SITE_NAME,
      images: [
        isDefaultOg
          ? { url: image, width: 1200, height: 630, alt: formattedTitle }
          : { url: image, alt: formattedTitle },
      ],
    },
    twitter: {
      card: isDefaultOg ? "summary_large_image" : "summary",
      title: formattedTitle,
      description: rawDescription,
      images: [image],
    },
  };
}

export const getSeoProduct = cache(async function getSeoProductImpl(identifier: string): Promise<SeoProduct | null> {
  if (!hasSupabaseServerConfig()) return null;
  let cleanId = identifier;
  try {
    cleanId = decodeURIComponent(identifier);
  } catch {
    cleanId = identifier;
  }
  const supabase = getSupabaseServiceRoleClient() ?? getSupabaseServerClient();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      cleanId
    );
  const query = supabase
    .from("products")
    .select("id,name,slug,short_description,description,image_url,price,original_price,stock,has_skus,delivery_type,metadata,status,updated_at,category_id")
    .limit(1);
  const { data, error } = isUuid
    ? await query.eq("id", cleanId).maybeSingle()
    : await query.eq("slug", cleanId).maybeSingle();
  if (error || !data) return null;

  const product = data as SeoProduct;
  const [categories, skuResult] = await Promise.all([
    listSeoCategories().catch(() => []),
    product.has_skus
      ? supabase
          .from("product_skus")
          .select("status,stock,delivery_type,metadata")
          .eq("product_id", product.id)
          .eq("status", "active")
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (product.category_id && categories.length > 0) {
    const byId = new Map(categories.map((c) => [c.id, c]));
    let cursor = byId.get(product.category_id) ?? null;
    const visited = new Set<string>();
    let validChain = Boolean(cursor);
    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      if (cursor.is_active === false) {
        validChain = false;
        break;
      }
      if (cursor.parent_id) {
        cursor = byId.get(cursor.parent_id) ?? null;
        if (!cursor) {
          validChain = false;
          break;
        }
      } else {
        break;
      }
    }
    if (!validChain) return null;
  }

  let effectiveStock = Number(product.stock ?? 0);
  let isPreorder = isPreorderDeliveryMode(product.delivery_type, product.metadata);
  if (product.has_skus && Array.isArray(skuResult.data) && skuResult.data.length > 0) {
    const activeSkus = skuResult.data as Array<{ stock?: number | null; delivery_type?: string | null; metadata?: unknown }>;
    effectiveStock = activeSkus.reduce((sum, row) => sum + Math.max(0, Number(row.stock ?? 0)), 0);
    if (activeSkus.some((row) => isPreorderDeliveryMode(row.delivery_type, row.metadata))) {
      isPreorder = true;
    }
  }

  return {
    ...product,
    effective_stock: effectiveStock,
    is_preorder: isPreorder,
  };
});

export type SeoProductSitemapEntry = {
  id: string;
  slug: string | null;
  updated_at: string | null;
  category_id: string | null;
};

/**
 * 分页拉取全部在售商品用于 sitemap.xml（突破 Supabase PostgREST 单次 1000 行上限）。
 */
export async function listSeoProductSitemapEntries(): Promise<SeoProductSitemapEntry[]> {
  if (!hasSupabaseServerConfig()) return [];
  const supabase = getSupabaseServiceRoleClient() ?? getSupabaseServerClient();
  const pageSize = 1000;
  const maxRows = 20000;
  const all: SeoProductSitemapEntry[] = [];

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await supabase
      .from("products")
      .select("id,slug,updated_at,category_id")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error || !data || data.length === 0) break;
    all.push(...(data as SeoProductSitemapEntry[]));
    if (data.length < pageSize) break;
  }

  return all;
}

export async function listSeoProducts() {
  if (!hasSupabaseServerConfig()) return [];
  const supabase = getSupabaseServiceRoleClient() ?? getSupabaseServerClient();
  const pageSize = 1000;
  const maxRows = 20000;
  const all: SeoProduct[] = [];

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await supabase
      .from("products")
      .select("id,name,slug,short_description,description,image_url,price,original_price,stock,status,updated_at,category_id")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error || !data || data.length === 0) break;
    all.push(...(data as SeoProduct[]));
    if (data.length < pageSize) break;
  }

  return all;
}

export async function listSeoCategories() {
  if (!hasSupabaseServerConfig()) return [];
  const supabase = getSupabaseServiceRoleClient() ?? getSupabaseServerClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id,parent_id,level,name,slug,description,is_active,updated_at")
    .eq("is_active", true)
    .order("level", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) return [];
  return (data ?? []) as SeoCategory[];
}

export function productJsonLd(product: SeoProduct, categoryPath = "") {
  const stockCount = Number(product.effective_stock ?? product.stock ?? 0);
  const isPreorder = Boolean(product.is_preorder || isPreorderDeliveryMode(product.delivery_type, product.metadata));
  const availability =
    product.status !== "active"
      ? "https://schema.org/OutOfStock"
      : isPreorder
        ? "https://schema.org/PreOrder"
        : stockCount <= 0
          ? "https://schema.org/OutOfStock"
          : "https://schema.org/InStock";
  const path = `/products/${product.slug || product.id}`;
  const now = new Date();
  const nextYear = new Date(now);
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  const priceValidUntil = nextYear.toISOString().slice(0, 10);
  const parsedUpdatedAt = product.updated_at ? new Date(product.updated_at) : null;
  const validFrom =
    parsedUpdatedAt && !Number.isNaN(parsedUpdatedAt.getTime())
      ? parsedUpdatedAt.toISOString()
      : now.toISOString();
  const isPhysicalShipping = product.delivery_type === "shipping";
  const servedRegions = ["HK", "US", "SG", "JP", "GB"];

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: (product.short_description || product.description || SITE_DESCRIPTION)
      .replace(/\s+/g, " ")
      .slice(0, 300),
    image: [absoluteUrl(product.image_url || DEFAULT_OG_IMAGE)],
    sku: product.slug || product.id,
    brand: {
      "@type": "Brand",
      name: SITE_NAME,
    },
    category: categoryPath || undefined,
    offers: {
      "@type": "Offer",
      url: absoluteUrl(path),
      priceCurrency: "CNY",
      price: Number(product.price ?? 0).toFixed(2),
      validFrom,
      priceValidUntil,
      availability,
      itemCondition: "https://schema.org/NewCondition",
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: {
          "@type": "MonetaryAmount",
          value: "0.00",
          currency: "CNY",
        },
        shippingDestination: {
          "@type": "DefinedRegion",
          addressCountry: servedRegions,
        },
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          handlingTime: {
            "@type": "QuantitativeValue",
            minValue: 0,
            maxValue: isPhysicalShipping ? 1 : 0,
            unitCode: "DAY",
          },
          transitTime: {
            "@type": "QuantitativeValue",
            minValue: isPhysicalShipping ? 1 : 0,
            maxValue: isPhysicalShipping ? 5 : 0,
            unitCode: "DAY",
          },
        },
      },
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: servedRegions,
        returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
      },
      seller: {
        "@type": "Organization",
        name: SITE_NAME,
      },
    },
  };
}

export function productBreadcrumbJsonLd(
  product: SeoProduct,
  category?: { name: string; path: string } | null
) {
  const items: Array<Record<string, unknown>> = [
    {
      "@type": "ListItem",
      position: 1,
      name: "首页",
      item: SITE_URL,
    },
  ];
  if (category) {
    items.push({
      "@type": "ListItem",
      position: 2,
      name: category.name,
      item: absoluteUrl(category.path),
    });
  }
  items.push({
    "@type": "ListItem",
    position: items.length + 1,
    name: product.name,
    item: absoluteUrl(`/products/${product.slug || product.id}`),
  });
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items,
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl(DEFAULT_OG_IMAGE),
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    inLanguage: "zh-CN",
  };
}
