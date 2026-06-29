import "server-only";

import type { Metadata } from "next";

import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase/server";

export const SITE_URL = "https://www.jianlian.shop";
export const SITE_NAME = "Jianlian Shop";
export const SITE_DESCRIPTION =
  "Jianlian Shop 提供数字账号、AI 会员充值、礼品卡、国际电话卡和接码服务。";
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
  const description = input.description?.trim() || SITE_DESCRIPTION;
  const url = absoluteUrl(input.path || "/");
  const image = absoluteUrl(input.image || DEFAULT_OG_IMAGE);

  return {
    metadataBase: new URL(SITE_URL),
    title: input.title,
    description,
    alternates: { canonical: url },
    robots: input.noIndex
      ? { index: false, follow: false, nocache: true }
      : { index: true, follow: true },
    openGraph: {
      type: "website",
      title: input.title,
      description,
      url,
      siteName: SITE_NAME,
      images: [{ url: image, width: 1200, height: 630, alt: input.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description,
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

export async function listSeoProducts() {
  if (!hasSupabaseServerConfig()) return [];
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("id,name,slug,short_description,description,image_url,price,original_price,stock,status,updated_at,category_id")
    .eq("status", "active")
    .order("updated_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as SeoProduct[];
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

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.short_description || product.description || SITE_DESCRIPTION,
    image: [absoluteUrl(product.image_url || DEFAULT_OG_IMAGE)],
    sku: product.slug || product.id,
    category: categoryPath || undefined,
    offers: {
      "@type": "Offer",
      url: absoluteUrl(path),
      priceCurrency: "CNY",
      price: Number(product.price ?? 0).toFixed(2),
      availability,
      itemCondition: "https://schema.org/NewCondition",
    },
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
  };
}
