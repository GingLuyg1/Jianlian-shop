import { NextResponse } from "next/server";

import { getServerAdminContext } from "@/lib/auth/require-admin";
import { adminOrderPaymentSelect, adminRechargeSelect, isPaymentSchemaMissing, normalizeOrderPaymentRow, normalizeRechargeRow } from "@/lib/payments/admin-payment-queries";
import type { AdminPaymentRecord } from "@/lib/payments/admin-payment-types";
import { getShanghaiTodayStartIso, POSTGREST_PAGE_SIZE, selectAllPaginated } from "@/lib/supabase/paginated-select";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getServerAdminContext();
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  const todayStartIso = getShanghaiTodayStartIso();

  try {
    const [orderResult, rechargeResult, orderExceptionResult, rechargeExceptionResult] = await Promise.all([
      selectAllPaginated<Record<string, unknown>>(
        (from, to) =>
          admin.supabase
            .from("order_payments")
            .select(adminOrderPaymentSelect)
            .gte("created_at", todayStartIso)
            .order("created_at", { ascending: false })
            .range(from, to) as unknown as PromiseLike<{
            data: Record<string, unknown>[] | null;
            error: { code?: string; message?: string } | null;
          }>,
        { pageSize: POSTGREST_PAGE_SIZE, maxRows: 10000 }
      ),
      selectAllPaginated<Record<string, unknown>>(
        (from, to) =>
          admin.supabase
            .from("account_recharges")
            .select(adminRechargeSelect)
            .gte("created_at", todayStartIso)
            .order("created_at", { ascending: false })
            .range(from, to) as unknown as PromiseLike<{
            data: Record<string, unknown>[] | null;
            error: { code?: string; message?: string } | null;
          }>,
        { pageSize: POSTGREST_PAGE_SIZE, maxRows: 10000 }
      ),
      admin.supabase.from("order_payments").select("id", { count: "exact", head: true }).not("exception_type", "is", null),
      admin.supabase.from("account_recharges").select("id", { count: "exact", head: true }).not("exception_type", "is", null),
    ]);
    if (orderResult.error) throw orderResult.error;
    if (rechargeResult.error && !isPaymentSchemaMissing(rechargeResult.error)) throw rechargeResult.error;
    if (orderExceptionResult.error) throw orderExceptionResult.error;
    if (rechargeExceptionResult.error && !isPaymentSchemaMissing(rechargeExceptionResult.error)) throw rechargeExceptionResult.error;

    const todayRows: AdminPaymentRecord[] = [
      ...orderResult.rows.map(normalizeOrderPaymentRow),
      ...rechargeResult.rows.map(normalizeRechargeRow),
    ];
    const paidToday = todayRows.filter((row) => row.status === "paid");
    const orderPaidToday = paidToday.filter((row) => row.business_type === "order");
    const rechargePaidToday = paidToday.filter((row) => row.business_type === "recharge");
    const successRate = todayRows.length ? Math.round((paidToday.length / todayRows.length) * 10000) / 100 : 0;
    const channels = paidToday.reduce<Record<string, number>>((acc, row) => {
      const key = row.channel || "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const exceptionRecordCount =
      (orderExceptionResult.count ?? 0) +
      (rechargeExceptionResult.error ? 0 : rechargeExceptionResult.count ?? 0);

    return NextResponse.json({
      todayPaymentAmount: orderPaidToday.reduce((sum, row) => sum + row.received_amount, 0),
      todayRechargeAmount: rechargePaidToday.reduce((sum, row) => sum + row.received_amount, 0),
      todaySuccessCount: paidToday.length,
      successRate,
      exceptionRecordCount,
      // Temporary response compatibility for existing consumers. This count is not limited to pending records.
      pendingExceptionCount: exceptionRecordCount,
      channelShare: Object.entries(channels).map(([channel, count]) => ({ channel, count })),
    });
  } catch (error) {
    return NextResponse.json({ error: isPaymentSchemaMissing(error) ? "支付统计表尚未初始化" : "支付统计读取失败" }, { status: isPaymentSchemaMissing(error) ? 503 : 500 });
  }
}
