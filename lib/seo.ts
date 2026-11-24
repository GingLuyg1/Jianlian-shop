import "server-only";

import type { Metadata } from "next";

import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const SITE_URL = "https://www.jianlian.shop";
export const SITE_NAME = "Jianlian Shop";
export const SITE_DESCRIPTION =
  "轻松连接全球数字生活。Jianlian Shop 为您提供 AI 会员、精选数字账号与全球礼品卡服务，让每一次数字探索都简单、即时。";
export const DEFAULT_OG_IMAGE = "/assets/jianlian-brand-logo.png";

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
  status: string;
  updated_at: string | null;
  category_id: string | null;
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
  const url = absoluteUrl(input.path || "/");
  const image = absoluteUrl(input.image || DEFAULT_OG_IMAGE);

  return {
    metadataBase: new URL(SITE_URL),
    title: input.title,
    description: rawDescription,
    alternates: { canonical: url },
    robots: input.noIndex
      ? { index: false, follow: false, nocache: true }
      : { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      title: input.title,
      description: rawDescription,
      url,
      siteName: SITE_NAME,
      images: [{ url: image, alt: input.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: rawDescription,
      images: [image],
    },
  };
}

export async function getSeoProduct(identifier: string): Promise<SeoProduct | null> {
  if (!hasSupabaseServerConfig()) return null;
  const supabase = getSupabaseServerClient();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      identifier
    );
  const query = supabase
    .from("products")
    .select("id,name,slug,short_description,description,image_url,price,original_price,stock,status,updated_at,category_id")
    .limit(1);
  const { data, error } = isUuid
    ? await query.eq("id", identifier).maybeSingle()
    : await query.eq("slug", identifier).maybeSingle();
  if (error || !data) return null;
  return data as SeoProduct;
}

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
  const supabase = getSupabaseServerClient();
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
  const supabase = getSupabaseServerClient();
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
  const supabase = getSupabaseServerClient();
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
  const availability =
    product.status !== "active" || Number(product.stock ?? 0) <= 0
      ? "https://schema.org/OutOfStock"
      : "https://schema.org/InStock";
  const path = `/products/${product.slug || product.id}`;
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  const priceValidUntil = nextYear.toISOString().slice(0, 10);

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
      priceValidUntil,
      availability,
      itemCondition: "https://schema.org/NewCondition",
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
