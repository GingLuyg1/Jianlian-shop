import { NextResponse } from "next/server";

import { getServerAdminContext } from "@/lib/auth/require-admin";
import { getPaymentErrorMessage } from "@/lib/payments/payment-status";
import { normalizePaymentRows, paymentSelect } from "@/lib/payments/payment-queries";

function isSchemaMissing(message: string) {
  return /order_payments|schema cache|PGRST205|42P01/i.test(message);
}

export async function GET(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.message }, { status: admin.status });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(20, Number(searchParams.get("pageSize") || 20)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const search = (searchParams.get("search") || "").trim();
  const status = searchParams.get("status") || "all";
  const method = searchParams.get("method") || "all";

  try {
    let query = admin.supabase
      .from("order_payments")
      .select(paymentSelect, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status !== "all") query = query.eq("status", status);
    if (method !== "all") query = query.eq("payment_method", method);
    if (search) {
      query = query.or(
        `payment_no.ilike.%${search}%,orders.order_no.ilike.%${search}%,orders.customer_email.ilike.%${search}%`
      );
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({ payments: normalizePaymentRows(data), count: count ?? 0 });
  } catch (error) {
    const message = getPaymentErrorMessage(error, "支付记录读取失败");
    return NextResponse.json(
      { error: isSchemaMissing(message) ? "支付记录表尚未初始化，请先执行 order_payments migration。" : message },
      { status: isSchemaMissing(message) ? 503 : 500 }
    );
  }
}
