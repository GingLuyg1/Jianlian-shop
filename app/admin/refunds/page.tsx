"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw, Search, X } from "lucide-react";
import { toast } from "sonner";

import { REFUND_METHOD_LABELS, REFUND_STATUS_LABELS, formatMoney } from "@/lib/refunds/refund-utils";

type RefundRow = {
  id: string;
  refundNo: string;
  orderNo: string;
  userEmail: string;
  userLabel: string;
  requestedAmount: number;
  approvedAmount: number | null;
  currency: string;
  paymentMethod: string;
  refundMethod: string;
  reasonCode: string;
  reasonDetail: string | null;
  contactInfo: string | null;
  status: string;
  providerRefundId: string | null;
  providerStatus: string | null;
  deliveryDelivered: boolean;
  deliverySnapshot: Record<string, unknown>;
  reviewNote: string | null;
  userVisibleNote: string | null;
  createdAt: string | null;
  reviewedAt: string | null;
  completedAt: string | null;
  waitHours: number | null;
};

const STATUS_OPTIONS = [
  { value: "all", label: "全部状态" },
  { value: "requested", label: "待审核" },
  { value: "reviewing", label: "审核中" },
  { value: "processing", label: "处理中" },
  { value: "succeeded", label: "已完成" },
  { value: "rejected", label: "已拒绝" },
  { value: "failed", label: "失败" },
  { value: "cancelled", label: "已取消" },
];

export default function AdminRefundsPage() {
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<RefundRow | null>(null);
  const [action, setAction] = useState("approve_balance");
  const [approvedAmount, setApprovedAmount] = useState("");
  const [note, setNote] = useState("");
  const [userNote, setUserNote] = useState("");
  const [providerRefundId, setProviderRefundId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadRefunds = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ status, pageSize: "50" });
    if (query.trim()) params.set("q", query.trim());
    try {
      const response = await fetch(`/api/admin/refunds?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "退款列表读取失败");
      setRefunds(Array.isArray(payload.refunds) ? payload.refunds : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "退款列表读取失败";
      setError(message);
      setRefunds([]);
    } finally {
      setLoading(false);
    }
  }, [query, status]);

  useEffect(() => {
    loadRefunds();
  }, [loadRefunds]);

  const counts = useMemo(() => {
    return refunds.reduce(
      (acc, row) => {
        acc.total += 1;
        if (["requested", "reviewing"].includes(row.status)) acc.pending += 1;
        if (row.status === "processing") acc.processing += 1;
        return acc;
      },
      { total: 0, pending: 0, processing: 0 }
    );
  }, [refunds]);

  function openDrawer(row: RefundRow) {
    setSelected(row);
    setAction(row.refundMethod === "balance" ? "approve_balance" : "mark_processing");
    setApprovedAmount(String(row.approvedAmount ?? row.requestedAmount));
    setNote("");
    setUserNote("");
    setProviderRefundId(row.providerRefundId ?? "");
  }

  async function submitAction() {
    if (!selected) return;
    if (!note.trim()) {
      toast.error("请填写审核备注");
      return;
    }
    const dangerous = ["approve_balance", "reject", "cancel", "complete_external", "fail"].includes(action);
    if (dangerous && !window.confirm("确认执行该退款操作？操作会写入审计日志。")) return;

    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/refunds/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          approvedAmount: Number(approvedAmount || selected.requestedAmount),
          reviewNote: note,
          userVisibleNote: userNote,
          providerRefundId,
          requestId: crypto.randomUUID(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "退款操作失败");
      toast.success("退款状态已更新");
      setSelected(null);
      await loadRefunds();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "退款操作失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">售后退款</h1>
          <p className="mt-1 text-sm text-slate-500">审核用户退款申请，登记余额退款或外部渠道人工退款。</p>
        </div>
        <button onClick={loadRefunds} className="inline-flex items-center gap-2 rounded-lg border border-orange-100 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm hover:bg-orange-50">
          <RefreshCcw className="h-4 w-4" /> 刷新
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="退款申请" value={counts.total} />
        <StatCard label="待审核" value={counts.pending} />
        <StatCard label="处理中" value={counts.processing} />
      </div>

      <div className="flex flex-wrap gap-3 rounded-xl border border-orange-100 bg-white p-3 shadow-sm">
        <label className="flex min-w-[280px] flex-1 items-center gap-2 rounded-lg border border-orange-100 bg-orange-50/40 px-3 py-2 text-sm">
          <Search className="h-4 w-4 text-orange-500" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索退款单号、订单号、用户邮箱" className="w-full bg-transparent outline-none" />
        </label>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-orange-100 bg-white px-3 py-2 text-sm outline-none">
          {STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-orange-100 bg-white shadow-sm">
        <div className="h-full overflow-auto">
          <table className="min-w-[1180px] w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-orange-50 text-slate-600">
              <tr>
                <Th>退款单号</Th><Th>订单号</Th><Th>用户</Th><Th>申请金额</Th><Th>批准金额</Th><Th>渠道</Th><Th>原因</Th><Th>交付</Th><Th>状态</Th><Th>申请时间</Th><Th>等待</Th><Th>操作</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="py-16 text-center text-slate-500">正在读取退款申请...</td></tr>
              ) : error ? (
                <tr><td colSpan={12} className="py-16 text-center text-red-500">{error}</td></tr>
              ) : refunds.length === 0 ? (
                <tr><td colSpan={12} className="py-16 text-center text-slate-500">暂无退款申请</td></tr>
              ) : refunds.map((row) => (
                <tr key={row.id} className="border-t border-orange-50 hover:bg-orange-50/40">
                  <Td className="font-medium text-slate-900">{row.refundNo}</Td>
                  <Td>{row.orderNo || "-"}</Td>
                  <Td>{row.userLabel || row.userEmail || "-"}</Td>
                  <Td>{formatMoney(row.requestedAmount, row.currency)}</Td>
                  <Td>{row.approvedAmount == null ? "-" : formatMoney(row.approvedAmount, row.currency)}</Td>
                  <Td>{REFUND_METHOD_LABELS[row.refundMethod as keyof typeof REFUND_METHOD_LABELS] ?? row.refundMethod}</Td>
                  <Td>{row.reasonCode}</Td>
                  <Td>{row.deliveryDelivered ? "已交付" : "未交付"}</Td>
                  <Td><StatusBadge status={row.status} /></Td>
                  <Td>{formatDate(row.createdAt)}</Td>
                  <Td>{row.waitHours == null ? "-" : `${row.waitHours}h`}</Td>
                  <Td><button onClick={() => openDrawer(row)} className="rounded-md bg-orange-600 px-3 py-1.5 text-white hover:bg-orange-700">查看</button></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 bg-black/35" onClick={() => setSelected(null)}>
          <aside className="ml-auto h-full w-full max-w-[780px] overflow-y-auto bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-950">退款详情</h2>
                <p className="mt-1 text-sm text-slate-500">{selected.refundNo} / {selected.orderNo}</p>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-full p-2 text-slate-500 hover:bg-orange-50"><X className="h-5 w-5" /></button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <Info label="用户" value={selected.userEmail || selected.userLabel} />
              <Info label="退款状态" value={REFUND_STATUS_LABELS[selected.status as keyof typeof REFUND_STATUS_LABELS] ?? selected.status} />
              <Info label="申请金额" value={formatMoney(selected.requestedAmount, selected.currency)} />
              <Info label="批准金额" value={selected.approvedAmount == null ? "-" : formatMoney(selected.approvedAmount, selected.currency)} />
              <Info label="退款方式" value={REFUND_METHOD_LABELS[selected.refundMethod as keyof typeof REFUND_METHOD_LABELS] ?? selected.refundMethod} />
              <Info label="交付状态" value={selected.deliveryDelivered ? "已有数字交付，禁止恢复库存" : "未交付或无交付记录"} />
              <Info label="申请原因" value={selected.reasonCode} />
              <Info label="联系方式" value={selected.contactInfo ?? "-"} />
            </div>

            <div className="mt-5 rounded-xl border border-orange-100 bg-orange-50/40 p-4 text-sm text-slate-700">
              <div className="font-semibold text-slate-900">用户说明</div>
              <p className="mt-2 whitespace-pre-wrap">{selected.reasonDetail || "用户未填写详细说明。"}</p>
            </div>

            <div className="mt-5 space-y-3 rounded-xl border border-orange-100 p-4">
              <h3 className="font-semibold text-slate-950">审核操作</h3>
              <select value={action} onChange={(event) => setAction(event.target.value)} className="w-full rounded-lg border border-orange-100 px-3 py-2 outline-none">
                <option value="approve_balance">批准余额退款</option>
                <option value="mark_processing">标记处理中</option>
                <option value="complete_external">登记外部退款完成</option>
                <option value="reject">拒绝退款</option>
                <option value="cancel">取消退款</option>
                <option value="fail">标记失败</option>
              </select>
              <input value={approvedAmount} onChange={(event) => setApprovedAmount(event.target.value)} type="number" min="0" step="0.01" className="w-full rounded-lg border border-orange-100 px-3 py-2 outline-none" placeholder="批准金额" />
              <input value={providerRefundId} onChange={(event) => setProviderRefundId(event.target.value)} className="w-full rounded-lg border border-orange-100 px-3 py-2 outline-none" placeholder="外部渠道人工退款参考号（外部完成时必填）" />
              <textarea value={note} onChange={(event) => setNote(event.target.value)} className="min-h-[96px] w-full rounded-lg border border-orange-100 px-3 py-2 outline-none" placeholder="管理员审核备注（必填）" />
              <textarea value={userNote} onChange={(event) => setUserNote(event.target.value)} className="min-h-[72px] w-full rounded-lg border border-orange-100 px-3 py-2 outline-none" placeholder="用户可见说明（选填）" />
              <button disabled={submitting} onClick={submitAction} className="w-full rounded-lg bg-orange-600 px-4 py-2.5 font-semibold text-white hover:bg-orange-700 disabled:opacity-60">
                {submitting ? "处理中..." : "提交审核操作"}
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-orange-100 bg-white p-4 shadow-sm"><div className="text-sm text-slate-500">{label}</div><div className="mt-2 text-2xl font-bold text-orange-600">{value}</div></div>;
}
function Th({ children }: { children: React.ReactNode }) { return <th className="whitespace-nowrap px-4 py-3 font-semibold">{children}</th>; }
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <td className={`whitespace-nowrap px-4 py-3 ${className}`}>{children}</td>; }
function Info({ label, value }: { label: string; value: React.ReactNode }) { return <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-medium text-slate-900">{value}</div></div>; }
function StatusBadge({ status }: { status: string }) { return <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700">{REFUND_STATUS_LABELS[status as keyof typeof REFUND_STATUS_LABELS] ?? status}</span>; }
function formatDate(value: string | null) { return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-"; }
