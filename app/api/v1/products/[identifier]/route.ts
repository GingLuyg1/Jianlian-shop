import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getRequestSourceKey } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{
    identifier: string;
  }>;
};

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const rateLimit = checkRateLimit("catalog_read", `v1_product:${getRequestSourceKey(request)}`);
  if (!rateLimit.allowed) return rateLimit.response!;

  try {
    const supabase = getSupabaseServerClient();
    const { identifier: rawIdentifier } = await context.params;
    const identifier = String(rawIdentifier ?? "").trim();
    if (!identifier || identifier.length > 160) {
      return NextResponse.json({ code: 400, message: "Invalid product identifier" }, { status: 400 });
    }

    const baseQuery = supabase
      .from("products")
      .select("id, name, slug, price, original_price, stock, status, delivery_type, image_url, description")
      .in("status", ["active", "sold_out"]);

    const { data: product, error } = UUID_RE.test(identifier)
      ? await baseQuery.eq("id", identifier).maybeSingle()
      : await baseQuery.eq("slug", identifier).maybeSingle();

    if (error || !product) {
      return NextResponse.json(
        { code: 404, message: "Product not found" },
        { status: 404 }
      );
    }

    const { data: skus } = await supabase
      .from("product_skus")
      .select("id, sku_code, sku_title, price, stock, status, sort_order")
      .eq("product_id", product.id)
      .in("status", ["active", "sold_out"])
      .order("sort_order", { ascending: true });

    return NextResponse.json({
      code: 200,
      message: "success",
      timestamp: Date.now(),
      data: {
        ...product,
        skus: skus || [],
      },
    });
  } catch (err: unknown) {
    console.error("[V1Product] lookup error", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { code: 500, message: "Internal server error" },
      { status: 500 }
    );
  }
}
