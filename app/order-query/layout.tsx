import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "订单查询",
  description: "使用订单号与安全查询凭证查询订单状态。",
  path: "/order-query",
  noIndex: true,
});

export default function OrderQueryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
