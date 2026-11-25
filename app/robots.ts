import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/products/", "/tutorials", "/assets/"],
        disallow: [
          "/admin/",
          "/api/",
          "/auth/",
          "/account/",
          "/faq",
          "/login",
          "/register",
          "/forgot-password",
          "/reset-password",
          "/checkout",
          "/payment",
          "/order-success",
          "/order-tracking",
          "/order-query",
          "/my-orders",
          "/promotion",
          "/preview",
          "/maintenance",
          "/r/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
