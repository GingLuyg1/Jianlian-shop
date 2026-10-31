"use client";

import SupabaseMallContent from "./SupabaseMallContent";
import { fallbackCategoriesByPath } from "@/lib/catalog/storefront-category-visuals";

export default function GiftCardsMallContent() {
  return (
    <SupabaseMallContent
      fallbackCategories={fallbackCategoriesByPath["/products/gift-cards"]}
      fallbackTitle="礼品卡 / 充值卡"
      primaryNames={["礼品卡", "充值卡"]}
      primarySlugs={["gift-cards", "gift-card", "recharge-card"]}
      productCategory="gift-cards"
    />
  );
}
