import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "网站维护中",
  description: "网站正在维护升级，请稍后再访问。",
  path: "/maintenance",
  noIndex: true,
});

export default function MaintenanceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
