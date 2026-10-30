"use client";

import SupabaseMallContent from "./SupabaseMallContent";
import { fallbackCategoriesByPath } from "@/lib/catalog/storefront-category-visuals";

export default function AiMembershipMallContent() {
  return (
    <SupabaseMallContent
      fallbackCategories={fallbackCategoriesByPath["/products/ai-membership"]}
      fallbackTitle="AI会员充值"
      primaryNames={["AI", "会员"]}
      primarySlugs={["ai-membership", "ai-member", "ai-recharge"]}
      productCategory="ai-membership"
    />
  );
}
