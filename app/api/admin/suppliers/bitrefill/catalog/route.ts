import { NextResponse } from "next/server";
import { getServerSuperAdminContext } from "@/lib/auth/require-admin";
import { getPersonalCatalogManager } from "@/lib/providers/bitrefill/catalog-server";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const admin = await getServerSuperAdminContext();
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status, headers });
  try {
    const params = new URL(request.url).searchParams, manager = getPersonalCatalogManager();
    const body = params.has("productId") ? await manager.detail(params.get("productId")!) : await manager.list(Object.fromEntries(params));
    return NextResponse.json(body, { headers });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    const accessDenied = ["AUTH_ERROR", "FORBIDDEN", "PRODUCT_NOT_AVAILABLE_IN_CURRENT_CONTEXT"].includes(code ?? "");
    const status = accessDenied ? 403 : code === "PRODUCT_NOT_FOUND" ? 404 : ["RATE_LIMITED", "BITREFILL_CATALOG_BUSY"].includes(code ?? "") ? 429 : /INVALID/.test(code ?? "") ? 400 : 503;
    return NextResponse.json({ error: accessDenied ? "当前 Personal API 凭据或地区上下文无权访问此商品；不会执行购买" : "商品目录读取失败，请稍后重试；不会执行购买", code: /^[A-Z0-9_]{1,90}$/.test(code ?? "") ? code : "BITREFILL_CATALOG_UNAVAILABLE" }, { status, headers });
  }
}
