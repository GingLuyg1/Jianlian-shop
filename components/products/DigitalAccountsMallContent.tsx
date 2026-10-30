"use client";

import SupabaseMallContent from "./SupabaseMallContent";
import { fallbackCategoriesByPath } from "@/lib/catalog/storefront-category-visuals";

export default function DigitalAccountsMallContent() {
  return (
    <SupabaseMallContent
      fallbackCategories={fallbackCategoriesByPath["/products/digital-accounts"]}
      fallbackTitle="数字账号"
      primaryNames={["数字账号"]}
      primarySlugs={["digital-accounts", "digital-account"]}
      productCategory="digital-accounts"
    />
  );
}
