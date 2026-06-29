import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "收银台",
  robots: { index: false, follow: false, nocache: true },
};

export default function PaymentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
