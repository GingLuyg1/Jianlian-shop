/** @type {import('next').NextConfig} */
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self' https:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://static.cloudflareinsights.com https://cdn.tailwindcss.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com https://cloudflareinsights.com https://api.qrserver.com",
  "frame-src 'self' https://challenges.cloudflare.com",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
  },
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/api/:path*",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      // Prevent static chunks and font files (.woff2) from appearing as
      // "Crawled - currently not indexed" in Google Search Console while
      // still allowing Googlebot to fetch them for page rendering.
      {
        source: "/_next/static/:path*",
        headers: [
          ...securityHeaders,
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      // Never long-cache the /tutorials page HTML or RSC payload: every
      // deployment rotates _next/static/chunks/* hashes, and caching HTML
      // causes stale chunk 404 / blank-content hydration failures.
      {
        source: "/tutorials",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
      // Tutorial screenshots and brand assets rarely change: let browsers
      // reuse static media files for 7 days without matching the /tutorials page itself.
      {
        source: "/tutorials/:path+.:ext(png|jpg|jpeg|webp|gif|svg|ico|avif|mp4|webm|pdf)",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" },
        ],
      },
      {
        source: "/assets/:path*",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" },
        ],
      },
      {
        source: "/mascots/:path*",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
