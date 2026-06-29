import { ReactNode } from "react";
import type { Metadata } from "next";

import AccountShell from "@/components/account/AccountShell";

export const metadata: Metadata = {
  title: "用户中心",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
