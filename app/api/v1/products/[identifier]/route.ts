import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { identifier: string } }
) {
  try {
    const supabase = getSupabaseServerClient();
    const identifier = params.identifier;

    const { data: product, error } = await supabase
      .from("products")
      .select("id, name, slug, price, original_price, stock, status, delivery_type, image_url, description, details")
      .or(`id.eq.${identifier},slug.eq.${identifier}`)
      .maybeSingle();

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
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { code: 500, message: "Internal server error", error: message },
      { status: 500 }
    );
  }
}
