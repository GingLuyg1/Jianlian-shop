"use client";

import SupabaseMallContent from "./SupabaseMallContent";
import { fallbackCategoriesByPath } from "@/lib/catalog/storefront-category-visuals";

export default function SimCardsMallContent() {
  return (
    <SupabaseMallContent
      fallbackCategories={fallbackCategoriesByPath["/products/sim-cards"]}
      fallbackTitle="国际电话卡"
      primaryNames={["国际电话卡", "电话卡"]}
      primarySlugs={["sim-cards", "phone-cards", "international-phone-cards"]}
      productCategory="sim-cards"
      queryParam="country"
    />
  );
}
