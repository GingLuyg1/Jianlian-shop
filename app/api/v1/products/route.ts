import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    const { data: products, error } = await supabase
      .from("products")
      .select("id, name, slug, price, original_price, stock, status, delivery_type, image_url, description")
      .eq("status", "active")
      .order("sort_order", { ascending: true });

    if (error) {
      return NextResponse.json(
        { code: 500, message: "Failed to fetch products", error: error.message },
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
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { code: 500, message: "Internal server error", error: message },
      { status: 500 }
    );
  }
}
