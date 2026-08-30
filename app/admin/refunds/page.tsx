"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw, Search, X } from "lucide-react";
import { toast } from "sonner";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { REFUND_METHOD_LABELS, REFUND_STATUS_LABELS, formatMoney } from "@/lib/refunds/refund-utils";
import { cn } from "@/lib/utils";

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

const BALANCE_REFUND_ACTIONS = [
  { value: "approve_balance", label: "批准余额退款" },
  { value: "reject", label: "拒绝退款" },
  { value: "cancel", label: "取消退款" },
  { value: "fail", label: "标记失败" },
];

const EXTERNAL_REFUND_ACTIONS = [
  { value: "mark_processing", label: "标记处理中" },
  { value: "complete_external", label: "登记外部退款完成" },
  { value: "reject", label: "拒绝退款" },
  { value: "cancel", label: "取消退款" },
  { value: "fail", label: "标记失败" },
];

function isBalanceRefund(row: RefundRow | null) {
  return row?.refundMethod === "balance" && row.paymentMethod === "balance";
}

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
  const hasFilters = Boolean(query.trim() || status !== "all");
  const isDestructiveAction = ["reject", "cancel", "fail"].includes(action);

  function openDrawer(row: RefundRow) {
    setSelected(row);
    setAction(isBalanceRefund(row) ? "approve_balance" : "mark_processing");
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
    const balanceRefund = isBalanceRefund(selected);
    if (action === "approve_balance" && !balanceRefund) {
      toast.error("外部支付订单不能通过余额退款自动完成");
      return;
    }
    if (action === "complete_external" && balanceRefund) {
      toast.error("余额支付订单请使用余额退款流程");
      return;
    }
    if (action === "complete_external" && !providerRefundId.trim()) {
      toast.error("请填写外部渠道真实退款参考号或交易摘要");
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
    <AdminPageShell
      title="售后退款"
      description="审核用户退款申请，登记余额退款或外部渠道人工退款。"
      actions={(
        <Button variant="outline" size="sm" onClick={loadRefunds} disabled={loading}>
          <RefreshCcw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          刷新
        </Button>
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">

      <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="当前结果" value={counts.total} />
        <StatCard label="待审核" value={counts.pending} />
        <StatCard label="处理中" value={counts.processing} />
      </div>

      <div className="grid shrink-0 gap-3 rounded-xl border bg-white p-3 shadow-sm md:grid-cols-[minmax(280px,1fr)_180px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索退款单号、订单号、用户邮箱" className="h-9 pl-9" />
        </div>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-md border bg-white px-3 text-sm">
          {STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
        {loading ? (
          <AdminTableSkeleton rows={8} />
        ) : error ? (
          <AdminErrorState title="退款列表加载失败" description={error} onRetry={loadRefunds} />
        ) : refunds.length === 0 ? (
          <AdminEmptyState
            title={hasFilters ? "没有符合条件的退款申请" : "暂无退款申请"}
            description={hasFilters ? "请调整搜索或退款状态后再试。" : "新的退款申请会显示在这里。"}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-[1180px] w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600">
              <tr>
                <Th>退款单号</Th><Th>订单号</Th><Th>用户</Th><Th>申请金额</Th><Th>批准金额</Th><Th>渠道</Th><Th>原因</Th><Th>交付</Th><Th>状态</Th><Th>申请时间</Th><Th>等待</Th><Th>操作</Th>
              </tr>
            </thead>
            <tbody>
              {refunds.map((row) => (
                <tr key={row.id} className="border-t hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{row.refundNo}</Td>
                  <Td>{row.orderNo || "-"}</Td>
                  <Td>{row.userLabel || row.userEmail || "-"}</Td>
                  <Td>{formatMoney(row.requestedAmount, row.currency)}</Td>
                  <Td>{row.approvedAmount == null ? "-" : formatMoney(row.approvedAmount, row.currency)}</Td>
                  <Td>{REFUND_METHOD_LABELS[row.refundMethod as keyof typeof REFUND_METHOD_LABELS] ?? row.refundMethod}</Td>
                  <Td className="max-w-[180px] truncate" title={row.reasonDetail ?? row.reasonCode}>{row.reasonCode}</Td>
                  <Td>{row.deliveryDelivered ? "已交付" : "未交付"}</Td>
                  <Td><StatusBadge status={row.status} /></Td>
                  <Td>{formatDate(row.createdAt)}</Td>
                  <Td>{row.waitHours == null ? "-" : `${row.waitHours}h`}</Td>
                  <Td className="sticky right-0 bg-white text-right"><Button variant="outline" size="sm" onClick={() => openDrawer(row)}>查看</Button></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 bg-slate-950/35" onClick={() => setSelected(null)}>
          <aside className="ml-auto flex h-full w-full max-w-[780px] flex-col bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">退款详情</h2>
                <p className="mt-1 text-sm text-slate-500">{selected.refundNo} / {selected.orderNo}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelected(null)}><X className="h-5 w-5" /></Button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
              <DetailSection title="基本信息">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Info label="退款单号" value={selected.refundNo} />
                  <Info label="原订单" value={selected.orderNo || "-"} />
                  <Info label="用户" value={selected.userEmail || selected.userLabel} />
                  <Info label="联系方式" value={selected.contactInfo ?? "-"} />
                  <Info label="支付方式" value={selected.paymentMethod || "-"} />
                  <Info label="退款方式" value={REFUND_METHOD_LABELS[selected.refundMethod as keyof typeof REFUND_METHOD_LABELS] ?? selected.refundMethod} />
                  <Info label="申请金额" value={formatMoney(selected.requestedAmount, selected.currency)} />
                  <Info label="批准金额" value={selected.approvedAmount == null ? "-" : formatMoney(selected.approvedAmount, selected.currency)} />
                </div>
              </DetailSection>

              <DetailSection title="原因与交付">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Info label="申请原因" value={selected.reasonCode} />
                  <Info label="交付状态" value={selected.deliveryDelivered ? "已有数字交付，禁止恢复库存" : "未交付或无交付记录"} />
                </div>
                <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                  <div className="font-medium text-slate-900">用户说明</div>
                  <p className="mt-2 whitespace-pre-wrap">{selected.reasonDetail || "用户未填写详细说明。"}</p>
                </div>
              </DetailSection>

              <DetailSection title="状态与时间">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Info label="退款状态" value={<StatusBadge status={selected.status} />} />
                  <Info label="渠道状态" value={selected.providerStatus ?? "-"} />
                  <Info label="渠道退款参考号" value={selected.providerRefundId ?? "-"} />
                  <Info label="申请时间" value={formatDate(selected.createdAt)} />
                  <Info label="审核时间" value={formatDate(selected.reviewedAt)} />
                  <Info label="完成时间" value={formatDate(selected.completedAt)} />
                  <Info label="审核备注" value={selected.reviewNote ?? "-"} />
                  <Info label="用户可见说明" value={selected.userVisibleNote ?? "-"} />
                </div>
              </DetailSection>

              <DetailSection title="审核操作">
              <div className={`rounded-lg border px-3 py-2 text-sm ${isBalanceRefund(selected) ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-amber-100 bg-amber-50 text-amber-700"}`}>
                {isBalanceRefund(selected)
                  ? "余额支付订单会通过服务端退款流程增加用户余额并创建余额流水。"
                  : "外部渠道暂未接入自动退款。请完成真实人工退款后，再填写真实退款参考号登记完成，不能伪造退款成功。"}
              </div>
              <select value={action} onChange={(event) => setAction(event.target.value)} className="mt-3 h-10 w-full rounded-md border px-3 text-sm">
                {(isBalanceRefund(selected) ? BALANCE_REFUND_ACTIONS : EXTERNAL_REFUND_ACTIONS).map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input value={approvedAmount} onChange={(event) => setApprovedAmount(event.target.value)} type="number" min="0" step="0.01" placeholder="批准金额" />
                <Input value={providerRefundId} onChange={(event) => setProviderRefundId(event.target.value)} placeholder={isBalanceRefund(selected) ? "余额退款无需填写外部参考号" : "外部渠道真实退款参考号或交易摘要（完成时必填）"} />
              </div>
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-3 min-h-[96px]" placeholder="管理员审核备注（必填）" />
              <Textarea value={userNote} onChange={(event) => setUserNote(event.target.value)} className="mt-3 min-h-[72px]" placeholder="用户可见说明（选填）" />
              <Button variant={isDestructiveAction ? "destructive" : "default"} disabled={submitting} onClick={submitAction} className="mt-3 w-full">
                {submitting ? "处理中..." : "提交审核操作"}
              </Button>
              </DetailSection>
            </div>
          </aside>
        </div>
      ) : null}
      </div>
    </AdminPageShell>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border bg-white p-4 shadow-sm"><div className="text-sm text-slate-500">{label}</div><div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div></div>;
}
function Th({ children }: { children: React.ReactNode }) { return <th className="whitespace-nowrap px-4 py-3 font-semibold">{children}</th>; }
function Td({ children, className = "", title }: { children: React.ReactNode; className?: string; title?: string }) { return <td className={`whitespace-nowrap px-4 py-3 ${className}`} title={title}>{children}</td>; }
function Info({ label, value }: { label: string; value: React.ReactNode }) { return <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-medium text-slate-900">{value}</div></div>; }
function DetailSection({ children, title }: { children: React.ReactNode; title: string }) { return <section className="rounded-xl border bg-white p-4"><h3 className="mb-3 font-semibold text-slate-950">{title}</h3>{children}</section>; }
function StatusBadge({ status }: { status: string }) { return <Badge variant="outline" className={cn("whitespace-nowrap", statusClass(status))}>{REFUND_STATUS_LABELS[status as keyof typeof REFUND_STATUS_LABELS] ?? status}</Badge>; }
function statusClass(status: string) {
  if (status === "succeeded") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (["requested", "reviewing", "processing"].includes(status)) return "border-amber-200 bg-amber-50 text-amber-700";
  if (["rejected", "failed"].includes(status)) return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}
function formatDate(value: string | null) { return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-"; }
