import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "工单中心",
  description: "Jianlian Shop 售后处理、订单咨询、充值问题与技术对接工单中心。",
  path: "/faq",
  noIndex: true,
});

export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return children;
}
