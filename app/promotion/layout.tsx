import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "推广中心",
  robots: { index: false, follow: false, nocache: true },
};

export default function PromotionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
