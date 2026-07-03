import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function isStaticAssetPath(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/images/") ||
    pathname.startsWith("/public/") ||
    pathname.startsWith("/assets/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    /\.(?:js|css|svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf|map)$/i.test(pathname)
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

async function isMaintenanceEnabled(supabase: ReturnType<typeof createServerClient>) {
  const { data, error } = await supabase
    .from("site_settings")
    .select("setting_key,setting_value")
    .in("setting_key", ["maintenance_enabled", "site_status"]);

  if (error) return false;
  const rows = new Map(
    ((data ?? []) as { setting_key?: unknown; setting_value?: unknown }[]).map((row) => [
      String(row.setting_key),
      row,
    ])
  );
  const enabled = getSettingRawValue(rows.get("maintenance_enabled"));
  const status = getSettingRawValue(rows.get("site_status"));
  return enabled === true || enabled === "true" || enabled === "1" || status === "maintenance";
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (isStaticAssetPath(pathname)) return NextResponse.next();

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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const requiresAuth = pathname === "/account" || pathname.startsWith("/account/") || pathname === "/admin" || pathname.startsWith("/admin/");
    if (requiresAuth && !user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "";
      loginUrl.searchParams.set("redirect", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }

    if (!isMaintenanceBypassPath(pathname) && (await isMaintenanceEnabled(supabase))) {
      const maintenanceUrl = request.nextUrl.clone();
      maintenanceUrl.pathname = "/maintenance";
      maintenanceUrl.search = "";
      return NextResponse.redirect(maintenanceUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/|favicon.ico|robots.txt|sitemap.xml|images/|public/|assets/|.*\\.(?:js|css|svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf|map)$).*)",
  ],
};
