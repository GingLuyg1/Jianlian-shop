import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "订单结果",
  robots: { index: false, follow: false, nocache: true },
};

export default function OrderSuccessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
