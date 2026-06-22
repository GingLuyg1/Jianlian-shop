import { NextResponse } from "next/server";

import { getServerAdminContext } from "@/lib/auth/require-admin";
import { adminOrderPaymentSelect, adminRechargeSelect, isPaymentSchemaMissing, normalizeOrderPaymentRow, normalizeRechargeRow } from "@/lib/payments/admin-payment-queries";
import type { AdminPaymentRecord } from "@/lib/payments/admin-payment-types";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getServerAdminContext();
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  try {
    const [orderResult, rechargeResult] = await Promise.all([
      admin.supabase.from("order_payments").select(adminOrderPaymentSelect).limit(1000),
      admin.supabase.from("account_recharges").select(adminRechargeSelect).limit(1000),
    ]);
    if (orderResult.error) throw orderResult.error;
    if (rechargeResult.error && !isPaymentSchemaMissing(rechargeResult.error)) throw rechargeResult.error;

    const rows: AdminPaymentRecord[] = [
      ...((orderResult.data ?? []) as Record<string, unknown>[]).map(normalizeOrderPaymentRow),
      ...((rechargeResult.data ?? []) as Record<string, unknown>[]).map(normalizeRechargeRow),
    ];
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const todayRows = rows.filter((row) => new Date(row.created_at).getTime() >= start);
    const paidToday = todayRows.filter((row) => row.status === "paid");
    const orderPaidToday = paidToday.filter((row) => row.business_type === "order");
    const rechargePaidToday = paidToday.filter((row) => row.business_type === "recharge");
    const successRate = todayRows.length ? Math.round((paidToday.length / todayRows.length) * 10000) / 100 : 0;
    const channels = paidToday.reduce<Record<string, number>>((acc, row) => {
      const key = row.channel || "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      todayPaymentAmount: orderPaidToday.reduce((sum, row) => sum + row.received_amount, 0),
      todayRechargeAmount: rechargePaidToday.reduce((sum, row) => sum + row.received_amount, 0),
      todaySuccessCount: paidToday.length,
      successRate,
      pendingExceptionCount: rows.filter((row) => Boolean(row.exception_type)).length,
      channelShare: Object.entries(channels).map(([channel, count]) => ({ channel, count })),
    });
  } catch (error) {
    return NextResponse.json({ error: isPaymentSchemaMissing(error) ? "支付统计表尚未初始化" : "支付统计读取失败" }, { status: isPaymentSchemaMissing(error) ? 503 : 500 });
  }
}
