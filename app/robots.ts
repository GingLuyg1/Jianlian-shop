import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/products/", "/faq", "/tutorials", "/assets/"],
        disallow: [
          "/admin/",
          "/api/",
          "/account/",
          "/login",
          "/register",
          "/forgot-password",
          "/reset-password",
          "/checkout",
          "/payment",
          "/order-success",
          "/order-tracking",
          "/my-orders",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
