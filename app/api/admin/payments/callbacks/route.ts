import { NextResponse } from "next/server";

import { DASHBOARD_PAYMENT_CALLBACK_EXCEPTION_RESULTS } from "@/lib/admin/dashboard-payment-schema.mjs";
import { getServerAdminContext } from "@/lib/auth/require-admin";
import { isPaymentSchemaMissing, sanitizePaymentError } from "@/lib/payments/admin-payment-queries";

export const dynamic = "force-dynamic";

const CALLBACK_LIST_SELECT =
  "id,channel,payment_no,provider_trade_no,signature_result,process_result,http_status,is_duplicate,received_at";

export async function GET(request: Request) {
  const admin = await getServerAdminContext();
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") || 20)));
  const search = (searchParams.get("search") ?? "").trim().replace(/[%,]/g, "");
  const attention = searchParams.get("attention") ?? "all";
  const from = (page - 1) * pageSize;

  try {
    let query = admin.supabase
      .from("payment_callback_logs")
      .select(CALLBACK_LIST_SELECT, { count: "exact" })
      .order("received_at", { ascending: false });
    if (attention === "failed") query = query.in("process_result", [...DASHBOARD_PAYMENT_CALLBACK_EXCEPTION_RESULTS]);
    if (search) query = query.or(`payment_no.ilike.%${search}%,provider_trade_no.ilike.%${search}%`);

    const { data, error, count } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    return NextResponse.json({ callbacks: data ?? [], count: count ?? 0 });
  } catch (error) {
    return NextResponse.json(
      { error: sanitizePaymentError(error, "支付回调记录加载失败") },
      { status: isPaymentSchemaMissing(error) ? 503 : 500 },
    );
  }
}
