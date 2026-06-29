import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";

import PageViewTracker from "@/components/analytics/PageViewTracker";
import { Toaster } from "@/components/ui/sonner";
import {
  buildPageMetadata,
  organizationJsonLd,
  SITE_DESCRIPTION,
  SITE_NAME,
  websiteJsonLd,
} from "@/lib/seo";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: `${SITE_NAME} | 数字商品服务`,
    description: SITE_DESCRIPTION,
    path: "/",
  }),
  title: {
    default: `${SITE_NAME} | 数字商品服务`,
    template: `%s | ${SITE_NAME}`,
  },
  applicationName: SITE_NAME,
  icons: {
    icon: "/assets/jianlian-brand-logo.png",
    shortcut: "/assets/jianlian-brand-logo.png",
    apple: "/assets/jianlian-brand-logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([organizationJsonLd(), websiteJsonLd()]),
          }}
        />
        {children}
        <Suspense fallback={null}>
          <PageViewTracker />
        </Suspense>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
