import { NextResponse } from "next/server";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { getOrderErrorMessage, listAdminOrders } from "@/lib/orders/order-queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await getServerAdminContext();
    if (!admin.ok) {
      return NextResponse.json({ error: admin.message }, { status: admin.status });
    }

    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? 1);
    const pageSize = Number(url.searchParams.get("pageSize") ?? 20);
    const status = url.searchParams.get("status") ?? "all";
    const paymentStatus = url.searchParams.get("paymentStatus") ?? "all";
    const deliveryType = url.searchParams.get("deliveryType") ?? "all";
    const startDate = url.searchParams.get("startDate") ?? "";
    const endDate = url.searchParams.get("endDate") ?? "";
    const sortBy = url.searchParams.get("sortBy") ?? "created_at";
    const sortDirection = url.searchParams.get("sortDirection") ?? "desc";
    const search = url.searchParams.get("search") ?? "";

    const result = await listAdminOrders(admin.supabase, {
      page,
      pageSize,
      status: status as never,
      paymentStatus: paymentStatus as never,
      deliveryType,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      sortBy: sortBy as never,
      sortDirection: sortDirection as never,
      search,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Admin Orders] list failed", error);
    return NextResponse.json(
      { error: getOrderErrorMessage(error, "订单读取失败") },
      { status: 500 }
    );
  }
}
