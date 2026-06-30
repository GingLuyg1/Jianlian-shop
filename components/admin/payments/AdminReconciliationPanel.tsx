"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Eye, RefreshCcw, Search, X } from "lucide-react";
import { toast } from "sonner";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  RECONCILIATION_DIFFERENCE_TYPES,
  RECONCILIATION_RESULTS,
  type AdminPaymentReconciliation,
  getDifferenceTypeLabel,
  getReconciliationResultClass,
  getReconciliationResultLabel,
  getRiskLevelClass,
  getRiskLevelLabel,
} from "@/lib/payments/admin-payment-types";
import { formatDateTime } from "@/lib/i18n/datetime";
import { formatCurrency } from "@/lib/i18n/money";
import { cn } from "@/lib/utils";

type ListPayload = { reconciliations?: AdminPaymentReconciliation[]; count?: number; error?: string };
type DetailPayload = { reconciliation?: AdminPaymentReconciliation; error?: string };

const PAGE_SIZE = 20;

function formatMoney(value: number | null | undefined, currency = "CNY") {
  return formatCurrency(value, currency);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : formatDateTime(value);
}

function useDebouncedValue(value: string, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

export default function AdminReconciliationPanel() {
  const [rows, setRows] = useState<AdminPaymentReconciliation[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [result, setResult] = useState("all");
  const [differenceType, setDifferenceType] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AdminPaymentReconciliation | null>(null);
  const [detail, setDetail] = useState<AdminPaymentReconciliation | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [recheckingId, setRecheckingId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search);
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        search: debouncedSearch,
        result,
        differenceType,
      });
      const response = await fetch(`/api/admin/payments/reconciliations?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as ListPayload | null;
      if (!response.ok) throw new Error(payload?.error ?? "对账记录加载失败");
      setRows(payload?.reconciliations ?? []);
      setCount(Number(payload?.count ?? 0));
    } catch (loadError) {
      setRows([]);
      setCount(0);
      setError(loadError instanceof Error ? loadError.message : "对账记录加载失败");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, differenceType, page, result]);

  useEffect(() => { loadRows(); }, [loadRows]);

  const loadDetail = useCallback(async (row: AdminPaymentReconciliation) => {
    setSelected(row);
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/admin/payments/reconciliations/${row.id}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as DetailPayload | null;
      if (!response.ok) throw new Error(payload?.error ?? "对账详情加载失败");
      setDetail(payload?.reconciliation ?? row);
    } catch (detailLoadError) {
      setDetailError(detailLoadError instanceof Error ? detailLoadError.message : "对账详情加载失败");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const recheck = async (row: AdminPaymentReconciliation) => {
    setRecheckingId(row.id);
    try {
      const response = await fetch(`/api/admin/payments/reconciliations/${row.id}/recheck`, { method: "POST", cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "重新检查失败");
      toast.success("已提交重新检查");
      await loadRows();
    } catch (recheckError) {
      toast.error(recheckError instanceof Error ? recheckError.message : "重新检查失败");
    } finally {
      setRecheckingId(null);
    }
  };

  return (
    <>
      <div className="grid shrink-0 gap-2 border-b px-4 py-3 min-[1200px]:grid-cols-[minmax(220px,1fr)_160px_190px_86px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="对账编号 / 业务单号 / 渠道" className="h-9 pl-9" />
        </div>
        <select value={result} onChange={(event) => { setResult(event.target.value); setPage(1); }} className="h-9 rounded-md border bg-white px-3 text-sm">
          <option value="all">全部结果</option>
          {RECONCILIATION_RESULTS.map((item) => <option key={item} value={item}>{getReconciliationResultLabel(item)}</option>)}
        </select>
        <select value={differenceType} onChange={(event) => { setDifferenceType(event.target.value); setPage(1); }} className="h-9 rounded-md border bg-white px-3 text-sm">
          <option value="all">全部差异类型</option>
          {RECONCILIATION_DIFFERENCE_TYPES.map((item) => <option key={item} value={item}>{getDifferenceTypeLabel(item)}</option>)}
        </select>
        <Button variant="outline" size="sm" onClick={() => { setSearch(""); setResult("all"); setDifferenceType("all"); setPage(1); }}>重置</Button>
      </div>
      {error ? (
        <div className="min-h-0 flex-1 p-4"><AdminErrorState description={error} onRetry={loadRows} /></div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1500px] table-fixed text-sm">
            <colgroup>
              <col className="w-[180px]" /><col className="w-[150px]" /><col className="w-[160px]" />
              <col className="w-[120px]" /><col className="w-[110px]" /><col className="w-[110px]" />
              <col className="w-[130px]" /><col className="w-[130px]" /><col className="w-[180px]" />
              <col className="w-[120px]" /><col className="w-[150px]" /><col className="w-[150px]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500">
              <tr className="border-b">
                <Th>对账编号</Th><Th>支付会话</Th><Th>业务单号</Th><Th>渠道</Th><Th>本地状态</Th><Th>渠道状态</Th>
                <Th>本地金额</Th><Th>渠道金额</Th><Th>差异类型</Th><Th>结果</Th><Th>检查时间</Th><Th className="text-right">操作</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 8 }).map((_, index) => <tr key={index} className="border-b"><td colSpan={12} className="px-4 py-3 text-slate-400">正在加载对账记录...</td></tr>) : null}
              {!loading && rows.length ? rows.map((row) => (
                <tr key={row.id} className="border-b hover:bg-slate-50">
                  <Td mono>{row.reconciliation_no}</Td>
                  <Td mono>{row.payment_session_id ?? "—"}</Td>
                  <Td mono>{row.business_id ?? "—"}</Td>
                  <Td>{row.channel_code ?? "—"}</Td>
                  <Td>{row.local_status ?? "—"}</Td>
                  <Td>{row.provider_status ?? "—"}</Td>
                  <Td>{formatMoney(row.local_amount, row.currency)}</Td>
                  <Td>{row.provider_amount === null ? "—" : formatMoney(row.provider_amount, row.currency)}</Td>
                  <Td><span className={cn(row.risk_level === "high" && "text-red-600")}>{getDifferenceTypeLabel(row.difference_type)}</span></Td>
                  <Td><Badge variant="outline" className={getReconciliationResultClass(row.result)}>{getReconciliationResultLabel(row.result)}</Badge></Td>
                  <Td>{formatDate(row.checked_at)}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => loadDetail(row)}><Eye className="mr-1 h-3.5 w-3.5" />查看</Button>
                      <Button variant="outline" size="sm" disabled={!row.provider || recheckingId === row.id} onClick={() => recheck(row)} title={row.provider ? "重新检查渠道状态" : "Provider 未配置，无法重新检查"}><RefreshCcw className="mr-1 h-3.5 w-3.5" />重查</Button>
                    </div>
                  </Td>
                </tr>
              )) : null}
              {!loading && !rows.length ? <tr><td colSpan={12} className="h-[360px] px-4"><AdminEmptyState title="暂无对账记录" description="尚未执行支付对账任务，或当前筛选条件下没有记录。" className="min-h-full" /></td></tr> : null}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex h-12 shrink-0 items-center justify-between border-t px-4 text-sm text-slate-500">
        <span>共 {count} 条记录，每页 {PAGE_SIZE} 条</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</Button>
          <span>第 {page} / {totalPages} 页</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>下一页</Button>
        </div>
      </div>
      {selected ? <ReconciliationDrawer selected={selected} detail={detail} detailLoading={detailLoading} detailError={detailError} onClose={() => setSelected(null)} onRetry={() => loadDetail(selected)} /> : null}
    </>
  );
}

function ReconciliationDrawer({ selected, detail, detailLoading, detailError, onClose, onRetry }: { selected: AdminPaymentReconciliation; detail: AdminPaymentReconciliation | null; detailLoading: boolean; detailError: string; onClose: () => void; onRetry: () => void }) {
  const item = detail ?? selected;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" onClick={onClose}>
      <aside className="flex h-full w-full max-w-[680px] flex-col bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex shrink-0 items-start justify-between border-b px-5 py-4">
          <div><h2 className="text-lg font-semibold text-slate-950">对账详情</h2><p className="mt-1 text-xs text-slate-500">{item.reconciliation_no}</p></div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {detailLoading ? <div className="space-y-3">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}</div> : null}
          {detailError ? <AdminErrorState description={detailError} onRetry={onRetry} /> : null}
          {!detailLoading && !detailError ? (
            <div className="space-y-4">
              {item.risk_level === "high" ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" />高风险异常</div><p className="mt-1 text-xs">系统不会自动回滚余额、订单或已交付库存，请人工核查。</p></div> : null}
              <DetailGroup title="本地支付信息" rows={[["业务类型", item.business_type === "recharge" ? "账户充值" : "商品订单"], ["支付会话", item.payment_session_id ?? "—"], ["业务单号", item.business_id ?? "—"], ["本地状态", item.local_status ?? "—"], ["本地金额", formatMoney(item.local_amount, item.currency)]]} />
              <DetailGroup title="渠道查询摘要" rows={[["渠道", item.channel_code ?? "—"], ["Provider", item.provider ?? "—"], ["渠道状态", item.provider_status ?? "—"], ["渠道交易号", item.provider_trade_no ? "已脱敏保存" : "—"]]} />
              <DetailGroup title="状态对比" rows={[["结果", getReconciliationResultLabel(item.result)], ["差异类型", getDifferenceTypeLabel(item.difference_type)], ["风险等级", getRiskLevelLabel(item.risk_level)]]} />
              <DetailGroup title="金额对比" rows={[["本地金额", formatMoney(item.local_amount, item.currency)], ["渠道金额", item.provider_amount === null ? "—" : formatMoney(item.provider_amount, item.currency)], ["币种", item.currency]]} />
              <DetailGroup title="恢复动作" rows={[["动作", item.recovery_action ?? "—"], ["状态", item.recovery_status ?? "—"], ["说明", item.recovery_error ?? "—"]]} />
              <DetailGroup title="错误信息" rows={[["错误代码", item.error_code ?? "—"], ["错误摘要", item.error_message ?? "—"]]} />
              <DetailGroup title="处理时间线" rows={[["检查时间", formatDate(item.checked_at)], ["解决时间", formatDate(item.resolved_at)], ["解决说明", item.resolution ?? "—"]]} />
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) { return <th className={cn("h-10 whitespace-nowrap px-3 text-left font-medium", className)}>{children}</th>; }
function Td({ children, className, mono }: { children: React.ReactNode; className?: string; mono?: boolean }) { return <td className={cn("truncate whitespace-nowrap px-3 py-3 align-middle text-slate-700", mono && "font-mono text-xs", className)}>{children}</td>; }
function DetailGroup({ title, rows }: { title: string; rows: Array<[string, string]> }) { return <section className="rounded-xl border"><div className="border-b px-4 py-3 text-sm font-semibold text-slate-950">{title}</div><div className="divide-y">{rows.map(([label, value]) => <div key={label} className="flex items-start justify-between gap-4 px-4 py-3 text-sm"><span className="shrink-0 text-slate-500">{label}</span><span className="min-w-0 break-all text-right text-slate-900">{value || "—"}</span></div>)}</div></section>; }
