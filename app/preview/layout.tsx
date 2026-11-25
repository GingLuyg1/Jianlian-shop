import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "多端预览",
  description: "内部多端响应式预览工具。",
  path: "/preview",
  noIndex: true,
});

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return children;
}
