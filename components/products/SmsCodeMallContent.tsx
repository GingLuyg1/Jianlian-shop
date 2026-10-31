"use client";

import SupabaseMallContent from "./SupabaseMallContent";
import { fallbackCategoriesByPath } from "@/lib/catalog/storefront-category-visuals";

export default function SmsCodeMallContent() {
  return (
    <SupabaseMallContent
      fallbackCategories={fallbackCategoriesByPath["/products/sms-code"]}
      fallbackTitle="接码服务"
      primaryNames={["接码服务", "接码"]}
      primarySlugs={["sms-code", "sms-codes"]}
      productCategory="sms-code"
      queryParam="country"
    />
  );
}
