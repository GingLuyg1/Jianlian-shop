"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { REFUND_STATUS_LABELS, formatMoney } from "@/lib/refunds/refund-utils";
import { openPublicSupport } from "@/lib/support/open-public-support";

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
  createdAt: string | null;
  completedAt: string | null;
};

type Props = {
  orderNo: string;
  totalAmount: number;
  currency?: string | null;
  status: string;
  paymentStatus: string;
};

export function OrderRefundPanel({ orderNo }: Props) {
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRefunds = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/refunds?pageSize=50`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "退款记录读取失败");
      const list = Array.isArray(payload.refunds) ? payload.refunds : [];
      setRefunds(list.filter((row: RefundRow) => row.orderNo === orderNo));
    } catch (err) {
      console.warn("[OrderRefundPanel] load failed", err);
      setRefunds([]);
    } finally {
      setLoading(false);
    }
  }, [orderNo]);

  useEffect(() => {
    loadRefunds();
  }, [loadRefunds]);

  return (
    <section className="rounded-xl border border-orange-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">退款 / 售后</h2>
          <p className="mt-1 text-sm text-slate-500">退款及售后请联系人工客服，由管理员审核处理。这里仅展示历史记录。</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/account/refunds" className="rounded-lg border border-orange-100 px-3 py-2 text-sm text-slate-700 hover:bg-orange-50">查看全部</Link>
          <button type="button" onClick={openPublicSupport} className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700">
            联系人工客服
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {loading ? <div className="text-sm text-slate-500">正在读取售后记录...</div> : null}
        {!loading && refunds.length === 0 ? <div className="text-sm text-slate-500">暂无退款 / 售后记录。</div> : null}
        {refunds.map((row) => (
          <div key={row.id} className="rounded-lg border border-orange-100 bg-orange-50/30 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-slate-900">{row.refundNo}</span>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs text-orange-700">{REFUND_STATUS_LABELS[row.status as keyof typeof REFUND_STATUS_LABELS] ?? row.status}</span>
            </div>
            <div className="mt-2 grid gap-2 text-slate-600 md:grid-cols-3">
              <span>申请金额：{formatMoney(row.requestedAmount, row.currency)}</span>
              <span>批准金额：{row.approvedAmount == null ? "-" : formatMoney(row.approvedAmount, row.currency)}</span>
              <span>申请时间：{formatDate(row.createdAt)}</span>
            </div>
            {row.reviewNote ? <p className="mt-2 text-slate-600">审核说明：{row.reviewNote}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-";
}
