"use client";

import SupabaseMallContent from "./SupabaseMallContent";

const fallbackCategories = [
  { slug: "us", name: "美国", icon: "message" as const },
  { slug: "uk", name: "英国", icon: "message" as const },
  { slug: "ca", name: "加拿大", icon: "message" as const },
  { slug: "au", name: "澳大利亚", icon: "message" as const },
  { slug: "jp", name: "日本", icon: "message" as const },
  { slug: "sg", name: "新加坡", icon: "message" as const },
  { slug: "hk", name: "香港", icon: "message" as const },
];

export default function SmsCodeMallContent() {
  return (
    <SupabaseMallContent
      fallbackCategories={fallbackCategories}
      fallbackTitle="接码服务"
      primaryNames={["接码服务", "接码"]}
      primarySlugs={["sms-code", "sms-codes"]}
      productCategory="sms-code"
      legacyQueryParams={["country"]}
    />
  );
}
