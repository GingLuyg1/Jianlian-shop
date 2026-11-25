import "./globals.css";
import type { Metadata } from "next";
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

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: `${SITE_NAME} | 数字商品服务`,
    description: SITE_DESCRIPTION,
    path: "/",
  }),
  // Use relative canonical "./" on root layout so child pages without explicit
  // alternates resolve to their own canonical URL instead of pointing to "/".
  alternates: {
    canonical: "./",
  },
  title: {
    default: `${SITE_NAME} | 数字商品服务`,
    template: `%s | ${SITE_NAME}`,
  },
  applicationName: SITE_NAME,
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/assets/jianlian-brand-logo-96.webp", type: "image/webp" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
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
        <Toaster richColors position="top-center" duration={4000} visibleToasts={4} />
      </body>
    </html>
  );
}

