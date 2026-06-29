"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

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

const ACTIVE_REFUND_STATUSES = new Set(["requested", "reviewing", "approved", "processing"]);

export function OrderRefundPanel({ orderNo, totalAmount, currency = "CNY", status, paymentStatus }: Props) {
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(totalAmount || ""));
  const [reasonCode, setReasonCode] = useState("product_issue");
  const [reasonDetail, setReasonDetail] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  const hasActiveRefund = useMemo(() => refunds.some((row) => ACTIVE_REFUND_STATUSES.has(row.status)), [refunds]);
  const canApply = paymentStatus === "paid" && !["cancelled", "refunded", "failed"].includes(status) && !hasActiveRefund;

  async function submitRefund() {
    const nextAmount = Number(amount);
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      toast.error("退款金额必须大于 0");
      return;
    }
    if (!reasonDetail.trim()) {
      toast.error("请填写退款说明");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNo,
          reasonCode,
          reasonDetail,
          requestedAmount: nextAmount,
          contactInfo,
          clientRequestId: crypto.randomUUID(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "退款申请提交失败");
      toast.success("退款申请已提交");
      setOpen(false);
      setReasonDetail("");
      setContactInfo("");
      await loadRefunds();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "退款申请提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-xl border border-orange-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">退款 / 售后</h2>
          <p className="mt-1 text-sm text-slate-500">数字商品已交付时会按当前退款政策限制处理，管理员审核后更新状态。</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/account/refunds" className="rounded-lg border border-orange-100 px-3 py-2 text-sm text-slate-700 hover:bg-orange-50">查看全部</Link>
          <button disabled={!canApply} onClick={() => setOpen((value) => !value)} className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">
            申请退款
          </button>
        </div>
      </div>

      {!canApply ? (
        <p className="mt-3 text-sm text-slate-500">{hasActiveRefund ? "该订单已有处理中的退款申请。" : "当前订单暂不支持申请退款。"}</p>
      ) : null}

      {open ? (
        <div className="mt-4 grid gap-3 rounded-xl bg-orange-50/50 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-slate-700">申请金额
              <input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="0" step="0.01" className="mt-1 w-full rounded-lg border border-orange-100 px-3 py-2 outline-none" />
            </label>
            <label className="text-sm text-slate-700">退款原因
              <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} className="mt-1 w-full rounded-lg border border-orange-100 px-3 py-2 outline-none">
                <option value="product_issue">商品问题</option>
                <option value="not_delivered">未交付</option>
                <option value="duplicate_payment">重复支付</option>
                <option value="other">其他</option>
              </select>
            </label>
          </div>
          <textarea value={reasonDetail} onChange={(event) => setReasonDetail(event.target.value)} className="min-h-[96px] rounded-lg border border-orange-100 px-3 py-2 outline-none" placeholder="请填写退款说明" />
          <input value={contactInfo} onChange={(event) => setContactInfo(event.target.value)} className="rounded-lg border border-orange-100 px-3 py-2 outline-none" placeholder="联系方式或补充说明（选填）" />
          <button disabled={submitting} onClick={submitRefund} className="justify-self-end rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60">
            {submitting ? "提交中..." : "提交退款申请"}
          </button>
        </div>
      ) : null}

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
