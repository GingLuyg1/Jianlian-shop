import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "商品分类",
  description: "浏览 Jianlian Shop 的 AI 会员、精选数字账号与全球礼品卡等优质数字商品。",
  path: "./",
});

export default function ProductsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
