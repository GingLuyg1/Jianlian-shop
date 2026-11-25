import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "确认下单",
  description: "Jianlian Shop 商品确认与结算页面。",
  path: "/checkout",
  noIndex: true,
});

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
