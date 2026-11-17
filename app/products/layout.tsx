import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "商品分类",
  description: "浏览 Jianlian Shop 的数字账号、AI 会员、礼品卡和国际电话卡等优质数字商品。",
  path: "/products/digital-accounts",
});

export default function ProductsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
