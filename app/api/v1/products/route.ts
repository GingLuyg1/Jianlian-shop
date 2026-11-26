import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getRequestSourceKey } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rateLimit = checkRateLimit("catalog_read", `v1_products:${getRequestSourceKey(request)}`);
  if (!rateLimit.allowed) return rateLimit.response!;

  try {
    const supabase = getSupabaseServerClient();
    const { data: products, error } = await supabase
      .from("products")
      .select("id, name, slug, price, original_price, stock, status, delivery_type, image_url, description")
      .eq("status", "active")
      .order("sort_order", { ascending: true })
      .limit(500);

    if (error) {
      return NextResponse.json(
        { code: 500, message: "Failed to fetch products" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      code: 200,
      message: "success",
      timestamp: Date.now(),
      data: products || [],
    });
  } catch (err: unknown) {
    console.error("[V1Products] error", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { code: 500, message: "Internal server error" },
      { status: 500 }
    );
  }
}
