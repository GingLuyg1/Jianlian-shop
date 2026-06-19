"use client";

import SupabaseMallContent from "./SupabaseMallContent";

const fallbackCategories = [
  { slug: "uk", name: "英国", icon: "phone" as const, aliases: ["giffgaff"] },
  { slug: "us", name: "美国", icon: "phone" as const, aliases: ["ultra-mobile"] },
  { slug: "jp", name: "日本", icon: "phone" as const },
  { slug: "kr", name: "韩国", icon: "phone" as const },
];

export default function SimCardsMallContent() {
  return (
    <SupabaseMallContent
      fallbackCategories={fallbackCategories}
      fallbackTitle="国际电话卡"
      primaryNames={["国际电话卡", "电话卡"]}
      primarySlugs={["sim-cards", "phone-cards", "international-phone-cards"]}
      productCategory="sim-cards"
      queryParam="country"
    />
  );
}
