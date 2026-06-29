"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCcw } from "lucide-react";

import PublicLayout from "@/components/layout/PublicLayout";
import { REFUND_STATUS_LABELS, formatMoney } from "@/lib/refunds/refund-utils";

type RefundRow = {
  id: string;
  refundNo: string;
  orderNo: string;
  requestedAmount: number;
  approvedAmount: number | null;
  currency: string;
  status: string;
  reasonCode: string;
  reasonDetail: string | null;
  reviewNote: string | null;
  refundMethod: string;
  createdAt: string | null;
  reviewedAt: string | null;
  completedAt: string | null;
};

export default function AccountRefundsPage() {
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRefunds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/refunds?pageSize=50", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "退款记录读取失败");
      setRefunds(Array.isArray(payload.refunds) ? payload.refunds : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "退款记录读取失败");
      setRefunds([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRefunds();
  }, [loadRefunds]);

  return (
    <PublicLayout>
      <main className="mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-6xl flex-col gap-4 px-6 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Link href="/account/orders" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-orange-600">
              <ArrowLeft className="h-4 w-4" /> 返回我的订单
            </Link>
            <h1 className="mt-3 text-2xl font-bold text-slate-950">退款 / 售后记录</h1>
            <p className="mt-1 text-sm text-slate-500">仅展示当前账号提交的退款和售后申请。</p>
          </div>
          <button onClick={loadRefunds} className="inline-flex items-center gap-2 rounded-lg border border-orange-100 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-orange-50">
            <RefreshCcw className="h-4 w-4" /> 刷新
          </button>
        </div>

        <section className="min-h-[320px] overflow-hidden rounded-xl border border-orange-100 bg-white shadow-sm">
          {loading ? (
            <div className="flex h-64 items-center justify-center text-slate-500">正在读取退款记录...</div>
          ) : error ? (
            <div className="flex h-64 items-center justify-center text-red-500">{error}</div>
          ) : refunds.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <div className="text-lg font-semibold text-slate-900">暂无退款记录</div>
              <p className="mt-2 text-sm text-slate-500">符合条件的订单可以在订单详情中提交退款申请。</p>
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead className="bg-orange-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3">退款单号</th>
                    <th className="px-4 py-3">订单号</th>
                    <th className="px-4 py-3">申请金额</th>
                    <th className="px-4 py-3">批准金额</th>
                    <th className="px-4 py-3">退款状态</th>
                    <th className="px-4 py-3">申请原因</th>
                    <th className="px-4 py-3">审核说明</th>
                    <th className="px-4 py-3">申请时间</th>
                    <th className="px-4 py-3">完成时间</th>
                  </tr>
                </thead>
                <tbody>
                  {refunds.map((row) => (
                    <tr key={row.id} className="border-t border-orange-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{row.refundNo}</td>
                      <td className="px-4 py-3"><Link href={`/account/orders/${row.orderNo}`} className="text-orange-600 hover:underline">{row.orderNo}</Link></td>
                      <td className="px-4 py-3">{formatMoney(row.requestedAmount, row.currency)}</td>
                      <td className="px-4 py-3">{row.approvedAmount == null ? "-" : formatMoney(row.approvedAmount, row.currency)}</td>
                      <td className="px-4 py-3">{REFUND_STATUS_LABELS[row.status as keyof typeof REFUND_STATUS_LABELS] ?? row.status}</td>
                      <td className="px-4 py-3">{row.reasonDetail || row.reasonCode}</td>
                      <td className="px-4 py-3">{row.reviewNote || "-"}</td>
                      <td className="px-4 py-3">{formatDate(row.createdAt)}</td>
                      <td className="px-4 py-3">{formatDate(row.completedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </PublicLayout>
  );
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-";
}
