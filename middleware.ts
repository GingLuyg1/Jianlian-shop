import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function isBlockedProbePath(pathname: string) {
  const lower = pathname.toLowerCase();
  return (
    lower.endsWith(".map") ||
    lower.includes("/.env") ||
    lower.includes("/.git") ||
    lower.includes("/.svn") ||
    lower.includes("/.ds_store") ||
    lower.startsWith("/wp-admin") ||
    lower.startsWith("/wp-login") ||
    lower.startsWith("/phpmyadmin") ||
    lower.startsWith("/actuator") ||
    lower === "/xmlrpc.php"
  );
}

function isStaticAssetPath(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/images/") ||
    pathname.startsWith("/public/") ||
    pathname.startsWith("/assets/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    /\.(?:js|css|svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$/i.test(pathname)
  );
}

function isMaintenanceBypassPath(pathname: string) {
  return (
    pathname === "/maintenance" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/")
  );
}

function getSettingRawValue(row: { setting_value?: unknown } | undefined) {
  const value = row?.setting_value;
  if (value && typeof value === "object" && "value" in value) {
    return (value as { value?: unknown }).value;
  }
  return value;
}

const TRUSTED_PUBLIC_HOSTS = new Set(
  [
    "www.jianlian.shop",
    "jianlian.shop",
    "localhost",
    "127.0.0.1",
    ...(process.env.NEXT_PUBLIC_SITE_URL
      ? [(() => { try { return new URL(process.env.NEXT_PUBLIC_SITE_URL).host; } catch { return ""; } })()]
      : []),
    ...(process.env.SITE_URL
      ? [(() => { try { return new URL(process.env.SITE_URL).host; } catch { return ""; } })()]
      : []),
  ].filter(Boolean)
);

function isTrustedHost(host: string) {
  const normalized = host.trim().toLowerCase();
  if (!normalized || /[\s/@\\]/.test(normalized)) return false;
  const hostnameOnly = normalized.split(":")[0];
  return TRUSTED_PUBLIC_HOSTS.has(normalized) || TRUSTED_PUBLIC_HOSTS.has(hostnameOnly);
}

function getPublicOrigin(request: NextRequest) {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  const rawForwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || "";
  const rawHost = request.headers.get("host")?.split(",")[0]?.trim() || "";
  const candidate = isTrustedHost(rawForwarded) ? rawForwarded : isTrustedHost(rawHost) ? rawHost : "";
  if (candidate && !candidate.startsWith("localhost") && !candidate.startsWith("127.0.0.1")) {
    const protoRaw = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
    const proto = protoRaw === "http" || protoRaw === "https" ? protoRaw : "https";
    return `${proto}://${candidate}`;
  }
  if (configuredSiteUrl) {
    try {
      return new URL(configuredSiteUrl).origin;
    } catch {
      // fall through
    }
  }
  return request.nextUrl.origin;
}

let maintenanceCache: { enabled: boolean; expiresAt: number } | null = null;
const MAINTENANCE_CACHE_TTL_MS = 15_000;

async function isMaintenanceEnabled(supabase: ReturnType<typeof createServerClient>) {
  const now = Date.now();
  if (maintenanceCache && now < maintenanceCache.expiresAt) {
    return maintenanceCache.enabled;
  }

  const { data, error } = await supabase
    .from("site_settings")
    .select("setting_key,setting_value")
    .in("setting_key", ["maintenance_enabled", "site_status"]);

  if (error) return maintenanceCache?.enabled ?? false;
  const rows = new Map(
    ((data ?? []) as { setting_key?: unknown; setting_value?: unknown }[]).map((row) => [
      String(row.setting_key),
      row,
    ])
  );
  const enabled = getSettingRawValue(rows.get("maintenance_enabled"));
  const status = getSettingRawValue(rows.get("site_status"));
  const isEnabled = enabled === true || enabled === "true" || enabled === "1" || status === "maintenance";
  maintenanceCache = { enabled: isEnabled, expiresAt: now + MAINTENANCE_CACHE_TTL_MS };
  return isEnabled;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (isBlockedProbePath(pathname)) {
    return new NextResponse(null, { status: 404 });
  }
  if (isStaticAssetPath(pathname)) return NextResponse.next();

  const isAdminApi = pathname === "/api/admin" || pathname.startsWith("/api/admin/");
  if (pathname.startsWith("/api/") && !isAdminApi) return NextResponse.next();

  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    if (isAdminApi) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: "请先登录" }, { status: 401 });
      }
      return response;
    }

    // Only the orders page shell is public so it can render its sign-in cover.
    // All order data APIs and every other protected account/admin route retain authentication.
    const requiresAuth = pathname === "/account" || (pathname.startsWith("/account/") && pathname !== "/account/orders") || pathname === "/admin" || pathname.startsWith("/admin/");
    if (requiresAuth) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        const redirectTarget = `${pathname}${request.nextUrl.search}`;
        const loginUrl = new URL(`/login?redirect=${encodeURIComponent(redirectTarget)}`, getPublicOrigin(request));
        return NextResponse.redirect(loginUrl);
      }
    }

    if (!isMaintenanceBypassPath(pathname) && (await isMaintenanceEnabled(supabase))) {
      const maintenanceUrl = new URL("/maintenance", getPublicOrigin(request));
      return NextResponse.redirect(maintenanceUrl);
    }
  }

  if (
    request.method === "GET" &&
    !request.cookies.get("jl_cache_purge_20261126") &&
    (request.headers.get("accept") || "").includes("text/html")
  ) {
    // One-time browser HTTP cache purge to evict legacy 7-day /tutorials HTML cache
    // without touching cookies, login sessions, or localStorage.
    response.headers.set("Clear-Site-Data", '"cache"');
    response.cookies.set("jl_cache_purge_20261126", "1", {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/|favicon.ico|robots.txt|sitemap.xml|images/|public/|assets/|.*\\.(?:js|css|svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf|map)$).*)",
  ],
};
