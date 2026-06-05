import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Jianlian - 全球数字商品与通信服务商城",
  description:
    "国际电话卡、礼品卡、数字账号服务、AI会员充值、账号充值、社媒电商拓客服务 - www.jianlian.shop",
  openGraph: {
    title: "Jianlian - 全球数字商品与通信服务商城",
    description: "一站式数字商品与通信服务平台",
    url: "https://www.jianlian.shop",
    siteName: "Jianlian",
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
