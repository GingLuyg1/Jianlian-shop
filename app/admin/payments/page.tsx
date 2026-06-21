"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, Loader2, RefreshCcw, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getManualPaymentMethod,
  getPaymentErrorMessage,
  getPaymentReviewStatusLabel,
  MANUAL_PAYMENT_METHODS,
  normalizePaymentReviewStatus,
  PAYMENT_REVIEW_STATUS_STYLES,
  PAYMENT_REVIEW_STATUS_VALUES,
} from "@/lib/payments/payment-status";
import type { PaymentRecord } from "@/lib/payments/payment-types";
import { cn } from "@/lib/utils";

const PAGE_SIZE_OPTIONS = [20, 50, 100];

function formatMoney(value: number | string | null | undefined) {
  return `¥${Number(value ?? 0).toFixed(2)}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function methodLabel(methodId: string) {
  return getManualPaymentMethod(methodId)?.label ?? (methodId || "未记录");
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [method, setMethod] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [updatingAction, setUpdatingAction] = useState("");

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        search,
        status,
        method,
      });
      const response = await fetch(`/api/admin/payments?${params.toString()}`);
      const result = (await response.json().catch(() => null)) as
        | { payments?: PaymentRecord[]; count?: number; error?: string }
        | null;
      if (!response.ok) throw new Error(result?.error ?? "支付记录读取失败");
      setPayments(result?.payments ?? []);
      setCount(Number(result?.count ?? 0));
      setSelectedPayment((current) =>
        current ? result?.payments?.find((payment) => payment.id === current.id) ?? current : null
      );
    } catch (loadError) {
      setError(getPaymentErrorMessage(loadError, "支付记录读取失败"));
    } finally {
      setLoading(false);
    }
  }, [method, page, pageSize, search, status]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const rows = useMemo(() => payments, [payments]);

  async function reviewPayment(payment: PaymentRecord, action: string) {
    if (action === "reject" && !adminNote.trim()) {
      toast.error("驳回支付记录必须填写原因");
      return;
    }

    setUpdatingAction(action);
    try {
      const response = await fetch(`/api/admin/payments/${payment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, adminNote }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "支付审核操作失败");
      toast.success("支付记录已更新");
      setAdminNote("");
      await loadPayments();
    } catch (reviewError) {
      toast.error(getPaymentErrorMessage(reviewError, "支付审核操作失败"));
    } finally {
      setUpdatingAction("");
    }
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 py-3 lg:px-5 lg:py-4">
      <div className="mb-3 flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">支付管理</h1>
          <p className="mt-1 text-sm text-slate-500">查看用户提交的人工支付凭证，并人工确认到账或驳回。</p>
        </div>
        <Button variant="outline" onClick={loadPayments}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          刷新
        </Button>
      </div>

      {error ? (
        <div className="mb-3 shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950">支付记录</h2>
            <p className="text-xs text-slate-500">当前结果 {count} 条</p>
          </div>
          <div className="grid w-full gap-2 md:w-auto md:grid-cols-[240px_150px_160px_90px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="搜索支付编号 / 订单 / 邮箱"
                className="pl-9"
              />
            </div>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="h-10 rounded-md border bg-white px-3 text-sm"
            >
              <option value="all">全部状态</option>
              {PAYMENT_REVIEW_STATUS_VALUES.map((value) => (
                <option key={value} value={value}>{getPaymentReviewStatusLabel(value)}</option>
              ))}
            </select>
            <select
              value={method}
              onChange={(event) => {
                setMethod(event.target.value);
                setPage(1);
              }}
              className="h-10 rounded-md border bg-white px-3 text-sm"
            >
              <option value="all">全部方式</option>
              {MANUAL_PAYMENT_METHODS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
            <Button
              variant="outline"
              onClick={() => {
                setSearch("");
                setStatus("all");
                setMethod("all");
                setPage(1);
              }}
            >
              重置
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1180px] table-fixed text-sm">
            <colgroup>
              <col className="w-[170px]" />
              <col className="w-[170px]" />
              <col className="w-[220px]" />
              <col className="w-[140px]" />
              <col className="w-[110px]" />
              <col className="w-[110px]" />
              <col className="w-[160px]" />
              <col className="w-[160px]" />
              <col className="w-[140px]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500">
              <tr className="border-b">
                <Th>支付编号</Th>
                <Th>订单编号</Th>
                <Th>用户邮箱</Th>
                <Th>支付方式</Th>
                <Th>提交金额</Th>
                <Th>支付状态</Th>
                <Th>提交时间</Th>
                <Th>审核时间</Th>
                <Th className="text-right">操作</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index} className="border-b">
                    <td colSpan={9} className="px-4 py-4 text-slate-400">正在加载支付记录...</td>
                  </tr>
                ))
              ) : rows.length ? (
                rows.map((payment) => {
                  const normalizedStatus = normalizePaymentReviewStatus(payment.status);
                  return (
                    <tr key={payment.id} className="border-b hover:bg-slate-50">
                      <Td mono>{payment.payment_no}</Td>
                      <Td mono>{payment.orders?.order_no ?? "-"}</Td>
                      <Td title={payment.orders?.customer_email ?? ""}>{payment.orders?.customer_email ?? "-"}</Td>
                      <Td>{methodLabel(payment.payment_method)}</Td>
                      <Td center>{formatMoney(payment.amount)}</Td>
                      <Td center>
                        <Badge variant="outline" className={cn("whitespace-nowrap", PAYMENT_REVIEW_STATUS_STYLES[normalizedStatus])}>
                          {getPaymentReviewStatusLabel(payment.status)}
                        </Badge>
                      </Td>
                      <Td>{formatDate(payment.submitted_at ?? payment.created_at)}</Td>
                      <Td>{formatDate(payment.reviewed_at)}</Td>
                      <Td className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setSelectedPayment(payment)}>
                          查看
                        </Button>
                      </Td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="h-64 px-4 text-center text-sm text-slate-500">
                    暂无支付记录。用户提交支付凭证后会显示在这里。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex shrink-0 items-center justify-between border-t px-4 py-3 text-sm text-slate-500">
          <span>共 {count} 条，第 {page} / {totalPages} 页</span>
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className="h-9 rounded-md border bg-white px-2"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size} 条/页</option>
              ))}
            </select>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              上一页
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
              下一页
            </Button>
          </div>
        </div>
      </Card>

      {selectedPayment ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" onClick={() => setSelectedPayment(null)}>
          <div
            className="flex h-full w-full max-w-2xl flex-col bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">支付审核</h3>
                <p className="text-xs text-slate-500">{selectedPayment.payment_no}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedPayment(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <Detail title="订单编号" value={selectedPayment.orders?.order_no ?? "-"} />
              <Detail title="用户邮箱" value={selectedPayment.orders?.customer_email ?? "-"} />
              <Detail title="支付方式" value={methodLabel(selectedPayment.payment_method)} />
              <Detail title="提交金额" value={formatMoney(selectedPayment.amount)} />
              <Detail title="订单金额" value={formatMoney(selectedPayment.orders?.total_amount)} />
              <Detail title="交易参考号" value={selectedPayment.transaction_reference || "-"} />
              <Detail title="用户备注" value={selectedPayment.user_note || "-"} />
              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="mb-2 text-sm font-medium text-slate-900">支付凭证</div>
                {selectedPayment.proof_urls.length ? (
                  <div className="space-y-2 text-xs text-slate-600">
                    {selectedPayment.proof_urls.map((proof) => (
                      <div key={proof} className="break-all rounded-md bg-white p-2">{proof}</div>
                    ))}
                  </div>
                ) : selectedPayment.proof_url ? (
                  <div className="break-all rounded-md bg-white p-2 text-xs text-slate-600">{selectedPayment.proof_url}</div>
                ) : (
                  <div className="text-sm text-slate-500">未上传凭证，仅填写了交易参考号。</div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900">管理员备注</label>
                <Textarea value={adminNote} onChange={(event) => setAdminNote(event.target.value)} rows={4} placeholder="审核说明或驳回原因" />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t p-4">
              <Button variant="outline" disabled={Boolean(updatingAction)} onClick={() => reviewPayment(selectedPayment, "start_review")}>
                {updatingAction === "start_review" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                开始审核
              </Button>
              <Button disabled={Boolean(updatingAction)} onClick={() => reviewPayment(selectedPayment, "approve")}>
                {updatingAction === "approve" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                确认到账
              </Button>
              <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" disabled={Boolean(updatingAction)} onClick={() => reviewPayment(selectedPayment, "reject")}>
                驳回
              </Button>
              <Button variant="ghost" disabled={Boolean(updatingAction)} onClick={() => reviewPayment(selectedPayment, "cancel")}>
                取消记录
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return <th className={cn("h-10 whitespace-nowrap px-3 text-left font-medium", className)}>{children}</th>;
}

function Td({ children, center, mono, title, className }: { children: ReactNode; center?: boolean; mono?: boolean; title?: string; className?: string }) {
  return (
    <td title={title} className={cn("truncate whitespace-nowrap px-3 py-3 align-middle text-slate-700", center && "text-center", mono && "font-mono text-xs", className)}>
      {children}
    </td>
  );
}

function Detail({ title, value }: { title: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border bg-white px-4 py-3 text-sm">
      <span className="shrink-0 text-slate-500">{title}</span>
      <span className="min-w-0 text-right text-slate-900">{value}</span>
    </div>
  );
}


