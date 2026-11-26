import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getRequestSourceKey } from "@/lib/security/rate-limit";

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
  const rateLimit = checkRateLimit("order_lookup", `v1_order:${getRequestSourceKey(request)}`);
  if (!rateLimit.allowed) return rateLimit.response!;

  try {
    const supabase = getSupabaseServerClient();
    const { orderNo } = await context.params;
    const normalizedOrderNo = String(orderNo ?? "").trim();
    if (!normalizedOrderNo || normalizedOrderNo.length > 80) {
      return NextResponse.json({ code: 400, message: "Invalid order number" }, { status: 400 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { code: 401, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: order, error } = await supabase
      .from("orders")
      .select("id, order_no, status, payment_status, fulfillment_status, total_amount, currency, created_at")
      .eq("order_no", normalizedOrderNo)
      .eq("user_id", user.id)
      .maybeSingle();

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
    console.error("[V1Order] lookup error", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { code: 500, message: "Internal server error" },
      { status: 500 }
    );
  }
}
