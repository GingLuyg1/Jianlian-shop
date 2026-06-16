import { NextResponse, type NextRequest } from "next/server";

function isStaticAssetPath(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/images/") ||
    pathname.startsWith("/public/") ||
    pathname.startsWith("/assets/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    /\.(?:js|css|svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf|map)$/i.test(
      pathname
    )
  );
}

export async function middleware(request: NextRequest) {
  if (isStaticAssetPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/|favicon.ico|robots.txt|sitemap.xml|images/|public/|assets/|.*\\.(?:js|css|svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf|map)$).*)",
  ],
};
