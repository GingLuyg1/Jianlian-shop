import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "使用教程",
  description: "Jianlian Shop 数字商品、账号、礼品卡和充值服务使用教程。",
  path: "/tutorials",
});

export default function TutorialsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
