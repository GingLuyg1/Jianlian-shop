import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://www.jianlian.shop"),
  title: "Jianlian.Shop 数字商品服务",
  description:
    "Jianlian.Shop 数字商品服务，提供数字账号、AI会员充值、礼品卡、国际电话卡等服务。",
  icons: {
    icon: "/assets/jianlian-brand-logo.png",
    shortcut: "/assets/jianlian-brand-logo.png",
    apple: "/assets/jianlian-brand-logo.png",
  },
  openGraph: {
    title: "Jianlian.Shop 数字商品服务",
    description: "一站式数字商品与通信服务平台",
    url: "https://www.jianlian.shop",
    siteName: "Jianlian.Shop",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
