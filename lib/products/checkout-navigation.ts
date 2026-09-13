import type { ProductCategory } from "@/lib/types";

const categories: ProductCategory[] = ["sim-cards", "gift-cards", "digital-accounts", "ai-membership", "sms-code", "account-recharge"];

export function safeProductReturnTo(value: string | null | undefined): string | null {
  if (!value || !/^\/products\/[a-z0-9-]+(?:[/?#]|$)/i.test(value) || /[\\\u0000-\u001f]/.test(value)) return null;
  try {
    const url = new URL(value, "https://jianlian.shop");
    return url.origin === "https://jianlian.shop" && /^\/products\/[a-z0-9-]+(?:\/|$)/i.test(url.pathname) ? value : null;
  } catch { return null; }
}

export function checkoutHref(id: string, source: string): string {
  const query = new URLSearchParams({ product: id });
  const returnTo = safeProductReturnTo(source);
  if (returnTo) query.set("returnTo", returnTo);
  return `/checkout?${query}`;
}

type Evidence = { id?: string; slug?: string | null; name: string; category?: string; metadata?: Record<string, unknown> | null };

export function resolveRechargeProductFamily(product: Evidence): "chatgpt" | "claude" | "gemini" | "grok" | "other" {
  if (product.category && product.category !== "ai-membership") return "other";
  const metadata = product.metadata ?? {};
  const evidence = [metadata.category_path, metadata.category_slug, metadata.subcategory_slug, product.slug, metadata.slug, product.id, product.name];
  for (const value of evidence) {
    if (typeof value !== "string") continue;
    const normalized = value.toLowerCase().replace(/[\s_-]+/g, "");
    if (/chatgpt|aigpt/.test(normalized)) return "chatgpt";
    if (/claude/.test(normalized)) return "claude";
    if (/gemini/.test(normalized)) return "gemini";
    if (/grok/.test(normalized)) return "grok";
  }
  return "other";
}

export function resolveCheckoutCategory(product: Evidence, source?: string | null): ProductCategory {
  const metadata = product.metadata ?? {};
  for (const value of [metadata.category_slug, metadata.category, product.category]) {
    if (categories.includes(value as ProductCategory)) return value as ProductCategory;
  }
  const safeSource = safeProductReturnTo(source);
  const fromRoute = safeSource?.split(/[/?#]/)[2];
  if (categories.includes(fromRoute as ProductCategory)) return fromRoute as ProductCategory;
  if (resolveRechargeProductFamily(product) !== "other") return "ai-membership";
  const slug = product.slug ?? product.id ?? "";
  if (slug.startsWith("gift-")) return "gift-cards";
  if (slug.startsWith("sms-")) return "sms-code";
  if (slug.startsWith("sim-") || /giffgaff|电话卡/i.test(product.name)) return "sim-cards";
  return "digital-accounts";
}
