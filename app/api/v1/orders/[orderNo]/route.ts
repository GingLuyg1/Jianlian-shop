import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    orderNo: string;
  }>;
};

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const supabase = getSupabaseServerClient();
    const { orderNo } = await context.params;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let query = supabase
      .from("orders")
      .select("id, order_no, product_name, amount, status, payment_status, delivery_status, cards, created_at")
      .eq("order_no", orderNo);

    if (user) {
      query = query.eq("user_id", user.id);
    }

    const { data: order, error } = await query.maybeSingle();

    if (error || !order) {
      return NextResponse.json(
        { code: 404, message: "Order not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      code: 200,
      message: "success",
      timestamp: Date.now(),
      data: order,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { code: 500, message: "Internal server error", error: message },
      { status: 500 }
    );
  }
}
