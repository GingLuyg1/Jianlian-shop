import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "找回密码",
  robots: { index: false, follow: false, nocache: true },
};

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
