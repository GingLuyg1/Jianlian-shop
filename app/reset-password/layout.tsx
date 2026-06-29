import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "重置密码",
  robots: { index: false, follow: false, nocache: true },
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
