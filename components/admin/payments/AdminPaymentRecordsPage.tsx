"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Copy, Eye, RefreshCcw, Search, X } from "lucide-react";
import { toast } from "sonner";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminBep20UnderpaymentPanel from "@/components/admin/payments/AdminBep20UnderpaymentPanel";
import AdminReconciliationPanel from "@/components/admin/payments/AdminReconciliationPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  PAYMENT_CHANNELS,
  PAYMENT_EXCEPTION_TYPES,
  PAYMENT_STATUS_VALUES,
  type AdminBep20ChainPayment,
  type AdminBep20OverpaymentWallet,
  type AdminPaymentCallback,
  type AdminPaymentRecord,
  getBusinessTypeLabel,
  getExceptionTypeLabel,
  getPaymentChannelLabel,
  getUnifiedPaymentStatusClass,
  getUnifiedPaymentStatusLabel,
  maskWallet,
} from "@/lib/payments/admin-payment-types";
import { formatDateTime } from "@/lib/i18n/datetime";
import { formatCurrency } from "@/lib/i18n/money";
import { cn } from "@/lib/utils";

type Props = { mode: "payments" | "recharges" };
type ListPayload = { payments?: AdminPaymentRecord[]; count?: number; error?: string };
type DetailPayload = {
  payment?: AdminPaymentRecord;
  callbacks?: AdminPaymentCallback[];
  callbackError?: string;
  chainPayment?: AdminBep20ChainPayment | null;
  chainPaymentError?: string;
  overpaymentWallet?: AdminBep20OverpaymentWallet;
  error?: string;
};
const PAGE_SIZE = 20;

function formatPaymentMoney(value: number | string | null | undefined, currency: string | null | undefined) {
  if (!currency) return `${formatCurrency(value, "")} 币种缺失`;
  return formatCurrency(value, currency);
}
function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : formatDateTime(value);
}
function compareUnsignedDecimal(left: string | null | undefined, right: string | null | undefined) {
  const normalize = (value: string | null | undefined) => {
    const match = String(value ?? "").trim().match(/^(\d+)(?:\.(\d+))?$/);
    if (!match) return null;
    const integer = match[1].replace(/^0+(?=\d)/, "");
    const fraction = (match[2] ?? "").replace(/0+$/, "");
    return { integer, fraction };
  };
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a.integer.length !== b.integer.length) return a.integer.length > b.integer.length ? 1 : -1;
  if (a.integer !== b.integer) return a.integer > b.integer ? 1 : -1;
  const width = Math.max(a.fraction.length, b.fraction.length);
  const af = a.fraction.padEnd(width, "0");
  const bf = b.fraction.padEnd(width, "0");
  return af === bf ? 0 : af > bf ? 1 : -1;
}
function useDebouncedValue(value: string, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

export default function AdminPaymentRecordsPage({ mode }: Props) {
  const isRechargePage = mode === "recharges";
  const [payments, setPayments] = useState<AdminPaymentRecord[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [businessType, setBusinessType] = useState(isRechargePage ? "recharge" : "all");
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sort, setSort] = useState("created_desc");
  const [view, setView] = useState<"all" | "exceptions" | "reconciliations" | "underpayments">("all");
  const [exceptionType, setExceptionType] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AdminPaymentRecord | null>(null);
  const [detail, setDetail] = useState<AdminPaymentRecord | null>(null);
  const [callbacks, setCallbacks] = useState<AdminPaymentCallback[]>([]);
  const [callbackError, setCallbackError] = useState("");
  const [chainPayment, setChainPayment] = useState<AdminBep20ChainPayment | null>(null);
  const [chainPaymentError, setChainPaymentError] = useState("");
  const [overpaymentWallet, setOverpaymentWallet] = useState<AdminBep20OverpaymentWallet>({ authorized: false, available: true, error: null, disposition: null });
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSearch(params.get("search") ?? "");
    setStatus(params.get("status") ?? "all");
    setChannel(params.get("channel") ?? "all");
    setStartDate(params.get("startDate") ?? "");
    setEndDate(params.get("endDate") ?? "");
    setSort(params.get("sort") ?? "created_desc");
    if (!isRechargePage) {
      setBusinessType(params.get("businessType") ?? "all");
      setView(
        params.get("view") === "exceptions"
          ? "exceptions"
          : params.get("view") === "reconciliations"
            ? "reconciliations"
            : params.get("view") === "underpayments"
              ? "underpayments"
              : "all",
      );
      setExceptionType(params.get("exceptionType") ?? "all");
    }
  }, [isRechargePage]);

  const buildParams = useCallback(() => new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
    search: debouncedSearch,
    businessType: isRechargePage ? "recharge" : businessType,
    channel,
    status,
    startDate,
    endDate,
    sort,
    view: isRechargePage ? "all" : view,
    exceptionType: isRechargePage ? "all" : exceptionType,
  }), [businessType, channel, debouncedSearch, endDate, exceptionType, isRechargePage, page, sort, startDate, status, view]);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (!isRechargePage && ["reconciliations", "underpayments"].includes(view)) { setLoading(false); return; }
      const params = buildParams();
      const endpoint = isRechargePage ? "/api/admin/recharges" : "/api/admin/payments";
      const response = await fetch(`${endpoint}?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as ListPayload | null;
      if (!response.ok) throw new Error(payload?.error ?? "支付数据加载失败");
      setPayments(payload?.payments ?? []);
      setCount(Number(payload?.count ?? 0));
      const urlParams = new URLSearchParams(params);
      urlParams.delete("pageSize");
      window.history.replaceState(null, "", `${window.location.pathname}?${urlParams.toString()}`);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "支付数据加载失败");
      setPayments([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [buildParams, isRechargePage, view]);

  useEffect(() => { loadPayments(); }, [loadPayments]);

  const loadDetail = useCallback(async (payment: AdminPaymentRecord) => {
    setSelected(payment);
    setDetail(null);
    setCallbacks([]);
    setCallbackError("");
    setChainPayment(null);
    setChainPaymentError("");
    setOverpaymentWallet({ authorized: false, available: true, error: null, disposition: null });
    setDetailError("");
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/admin/payments/${payment.id}?source=${payment.source}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as DetailPayload | null;
      if (!response.ok) throw new Error(payload?.error ?? "支付详情加载失败");
      setDetail(payload?.payment ?? payment);
      setCallbacks(payload?.callbacks ?? []);
      setCallbackError(payload?.callbackError ?? "");
      setChainPayment(payload?.chainPayment ?? null);
      setChainPaymentError(payload?.chainPaymentError ?? "");
      setOverpaymentWallet(payload?.overpaymentWallet ?? { authorized: false, available: true, error: null, disposition: null });
    } catch (detailLoadError) {
      setDetailError(detailLoadError instanceof Error ? detailLoadError.message : "支付详情加载失败");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const resetFilters = () => {
    setSearch(""); setBusinessType(isRechargePage ? "recharge" : "all"); setChannel("all"); setStatus("all");
    setStartDate(""); setEndDate(""); setSort("created_desc"); setView("all"); setExceptionType("all"); setPage(1);
  };
  const copyText = async (value: string | null | undefined) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast.success("已复制");
  };

  return (
    <AdminPageShell title={isRechargePage ? "充值管理" : "支付管理"} description={isRechargePage ? "查看账户充值支付记录。管理员不能在此直接给用户余额入账。" : "统一查看商品订单和账户充值支付记录，异常支付仅做只读追踪。"} actions={<Button variant="outline" size="sm" onClick={loadPayments} disabled={loading}><RefreshCcw className="mr-2 h-4 w-4" />刷新</Button>}>
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
        {!isRechargePage ? <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2"><Button size="sm" variant={view === "all" ? "default" : "outline"} onClick={() => { setView("all"); setPage(1); }}>全部支付</Button><Button size="sm" variant={view === "exceptions" ? "default" : "outline"} onClick={() => { setView("exceptions"); setPage(1); }}>异常支付</Button><Button size="sm" variant={view === "underpayments" ? "default" : "outline"} onClick={() => { setView("underpayments"); setPage(1); }}>欠额转余额</Button><Button size="sm" variant={view === "reconciliations" ? "default" : "outline"} onClick={() => { setView("reconciliations"); setPage(1); }}>对账记录</Button>{view === "exceptions" ? <select value={exceptionType} onChange={(event) => { setExceptionType(event.target.value); setPage(1); }} className="h-9 rounded-md border bg-white px-3 text-sm"><option value="all">全部异常类型</option>{PAYMENT_EXCEPTION_TYPES.map((item) => <option key={item} value={item}>{getExceptionTypeLabel(item)}</option>)}</select> : null}</div> : null}
        {view === "reconciliations" ? <AdminReconciliationPanel /> : view === "underpayments" ? <AdminBep20UnderpaymentPanel /> : <>
        <div className="grid shrink-0 gap-2 border-b px-4 py-3 min-[1200px]:grid-cols-[minmax(180px,1.2fr)_150px_150px_145px_145px_140px_86px] min-[1600px]:grid-cols-[minmax(220px,1.35fr)_140px_145px_145px_145px_140px_86px_86px]">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="支付单号 / 业务单号 / 用户邮箱" className="h-9 pl-9" /></div>
          {!isRechargePage ? <select value={businessType} onChange={(event) => { setBusinessType(event.target.value); setPage(1); }} className="h-9 rounded-md border bg-white px-3 text-sm"><option value="all">全部业务</option><option value="order">商品订单</option><option value="recharge">账户充值</option></select> : null}
          <select value={channel} onChange={(event) => { setChannel(event.target.value); setPage(1); }} className="h-9 rounded-md border bg-white px-3 text-sm"><option value="all">全部渠道</option>{PAYMENT_CHANNELS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-9 rounded-md border bg-white px-3 text-sm"><option value="all">全部状态</option>{PAYMENT_STATUS_VALUES.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <Input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} className="h-9" />
          <Input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} className="h-9" />
          <select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} className="h-9 rounded-md border bg-white px-3 text-sm"><option value="created_desc">最新创建</option><option value="created_asc">最早创建</option><option value="amount_desc">金额从高到低</option><option value="amount_asc">金额从低到高</option></select>
          <Button variant="outline" size="sm" onClick={resetFilters}>重置</Button>
        </div>
        {error ? <div className="min-h-0 flex-1 p-4"><AdminErrorState description={error} onRetry={loadPayments} /></div> : <div className="min-h-0 flex-1 overflow-auto"><PaymentTable isRechargePage={isRechargePage} loading={loading} payments={payments} copyText={copyText} loadDetail={loadDetail} /></div>}
        <div className="flex h-12 shrink-0 items-center justify-between border-t px-4 text-sm text-slate-500"><span>共 {count} 条记录，每页 {PAGE_SIZE} 条</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</Button><span>第 {page} / {totalPages} 页</span><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>下一页</Button></div></div></>}
      </Card>
      {selected ? <><PaymentDrawer selected={selected} detail={detail} callbacks={callbacks} callbackError={callbackError} chainPayment={chainPayment} chainPaymentError={chainPaymentError} overpaymentWallet={overpaymentWallet} detailLoading={detailLoading} detailError={detailError} onClose={() => setSelected(null)} onRetry={() => loadDetail(selected)} onChanged={async () => { await loadPayments(); await loadDetail(selected); }} copyText={copyText} />{selected.source === "account_recharges" ? <RechargeReviewOverlay rechargeId={selected.id} onChanged={async () => { await loadPayments(); await loadDetail(selected); }} /> : null}</> : null}
    </AdminPageShell>
  );
}

function PaymentTable({ isRechargePage, loading, payments, copyText, loadDetail }: { isRechargePage: boolean; loading: boolean; payments: AdminPaymentRecord[]; copyText: (value: string | null | undefined) => void; loadDetail: (payment: AdminPaymentRecord) => void }) {
  const colSpan = isRechargePage ? 14 : 15;
  return <table className="w-full min-w-[1760px] table-fixed text-sm"><colgroup><col className="w-[170px]" />{!isRechargePage ? <col className="w-[110px]" /> : null}<col className="w-[170px]" /><col className="w-[210px]" /><col className="w-[130px]" /><col className="w-[110px]" /><col className="w-[120px]" /><col className="w-[110px]" /><col className="w-[120px]" /><col className="w-[120px]" /><col className="w-[110px]" /><col className="w-[190px]" /><col className="w-[150px]" /><col className="w-[150px]" /><col className="w-[90px]" /></colgroup><thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500"><tr className="border-b"><Th>支付单号</Th>{!isRechargePage ? <Th>业务类型</Th> : null}<Th>{isRechargePage ? "充值单号" : "订单号/充值单号"}</Th><Th>用户邮箱</Th><Th>支付渠道</Th><Th>网络</Th><Th>{isRechargePage ? "充值金额" : "业务金额"}</Th><Th>手续费</Th><Th>应付金额</Th><Th>到账金额</Th><Th>支付状态</Th><Th>渠道交易号</Th><Th>创建时间</Th><Th>支付时间</Th><Th className="text-right">操作</Th></tr></thead><tbody>{loading ? Array.from({ length: 8 }).map((_, index) => <tr key={index} className="border-b"><td colSpan={colSpan} className="px-4 py-3 text-slate-400">正在加载支付记录...</td></tr>) : payments.length ? payments.map((payment) => <tr key={`${payment.source}-${payment.id}`} className="border-b hover:bg-slate-50"><Td mono>{payment.payment_no}</Td>{!isRechargePage ? <Td>{getBusinessTypeLabel(payment.business_type)}</Td> : null}<Td mono>{payment.business_no ?? "—"}</Td><Td title={payment.user_email ?? ""}>{payment.user_email ?? "—"}</Td><Td>{getPaymentChannelLabel(payment.channel)}</Td><Td>{payment.channel === "alipay" || payment.channel === "wechat" ? "—" : payment.network ?? "—"}</Td><Td>{formatPaymentMoney(payment.business_amount, payment.business_currency)}</Td><Td>{formatPaymentMoney(payment.fee_amount, payment.payable_currency ?? payment.business_currency)}</Td><Td>{formatPaymentMoney(payment.payable_amount, payment.payable_currency)}</Td><Td>{formatPaymentMoney(payment.received_amount, payment.received_currency)}</Td><Td><Badge variant="outline" className={cn("whitespace-nowrap", getUnifiedPaymentStatusClass(payment.status))}>{getUnifiedPaymentStatusLabel(payment.status)}</Badge></Td><Td><button type="button" onClick={() => copyText(payment.provider_trade_no)} className="flex max-w-full items-center gap-1 text-left text-slate-700 hover:text-primary" title={payment.provider_trade_no ?? ""}><span className="truncate font-mono text-xs">{payment.provider_trade_no ?? "—"}</span>{payment.provider_trade_no ? <Copy className="h-3.5 w-3.5 shrink-0" /> : null}</button></Td><Td>{formatDate(payment.created_at)}</Td><Td>{formatDate(payment.paid_at)}</Td><Td className="text-right"><Button variant="outline" size="sm" onClick={() => loadDetail(payment)}><Eye className="mr-1 h-3.5 w-3.5" />查看</Button></Td></tr>) : <tr><td colSpan={colSpan} className="h-[360px] px-4"><AdminEmptyState title={isRechargePage ? "暂无充值记录" : "暂无支付记录"} description="当前筛选条件下没有记录。" className="min-h-full" /></td></tr>}</tbody></table>;
}

function PaymentDrawer({ selected, detail, callbacks, callbackError, chainPayment, chainPaymentError, overpaymentWallet, detailLoading, detailError, onClose, onRetry, onChanged, copyText }: { selected: AdminPaymentRecord; detail: AdminPaymentRecord | null; callbacks: AdminPaymentCallback[]; callbackError: string; chainPayment: AdminBep20ChainPayment | null; chainPaymentError: string; overpaymentWallet: AdminBep20OverpaymentWallet; detailLoading: boolean; detailError: string; onClose: () => void; onRetry: () => void; onChanged: () => Promise<void>; copyText: (value: string | null | undefined) => void }) {
  const underpaymentCredited = detail?.exception_type === "underpayment_credited_to_wallet";
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" onClick={onClose}>
      <aside className="flex h-full w-full max-w-[760px] flex-col bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex shrink-0 items-start justify-between border-b px-5 py-4">
          <div><h2 className="text-lg font-semibold text-slate-950">支付详情</h2><p className="mt-1 text-xs text-slate-500">{selected.payment_no}</p></div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {detailLoading ? <DetailSkeleton /> : null}
          {detailError ? <AdminErrorState description={detailError} onRetry={onRetry} /> : null}
          {!detailLoading && !detailError && detail ? (
            <div className="space-y-4">
              {underpaymentCredited ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">欠额款已转入用户余额，原订单已取消</div> : null}
              <DetailGroup title="基础信息" rows={[["支付单号", detail.payment_no], ["业务类型", getBusinessTypeLabel(detail.business_type)], ["支付状态", underpaymentCredited ? "欠额已转余额" : getUnifiedPaymentStatusLabel(detail.status)], ["创建时间", formatDate(detail.created_at)], ["支付时间", formatDate(detail.paid_at)]]} />
              <DetailGroup title="关联业务" rows={[["业务单号", detail.business_no ?? "—"], ["用户邮箱", detail.user_email ?? "—"], ["用户备注", detail.user_note ?? "—"], ["管理员备注", detail.admin_note ?? "—"]]} />
              <DetailGroup title="金额明细" rows={[["业务金额", formatPaymentMoney(detail.business_amount, detail.business_currency)], ["手续费", formatPaymentMoney(detail.fee_amount, detail.payable_currency ?? detail.business_currency)], ["应付金额", formatPaymentMoney(detail.payable_amount, detail.payable_currency)], ["到账金额", formatPaymentMoney(detail.received_amount, detail.received_currency)], ["平台净额", formatPaymentMoney(detail.platform_net_amount, detail.received_currency)]]} />
              <DetailGroup title="渠道信息" rows={[["支付渠道", getPaymentChannelLabel(detail.channel)], ["网络", detail.channel === "alipay" || detail.channel === "wechat" ? "—" : detail.network ?? "—"], ["渠道交易号", detail.provider_trade_no ?? "—", detail.provider_trade_no ? () => copyText(detail.provider_trade_no) : undefined], ["交易参考号", detail.transaction_reference ?? "—"], ["钱包地址", maskWallet(null)]]} />
              {chainPayment || chainPaymentError ? <Bep20ChainPaymentPanel detail={detail} chainPayment={chainPayment} chainPaymentError={chainPaymentError} overpaymentWallet={overpaymentWallet} copyText={copyText} onChanged={onChanged} /> : null}
              <DetailGroup title="回调状态" rows={[["回调状态", detail.callback_status ?? "—"], ["回调原文", "仅显示脱敏摘要，不展示完整请求体"]]} />
              <CallbackRecords callbacks={callbacks} callbackError={callbackError} />
              <DetailGroup title="状态变更记录" rows={[["当前版本", "暂未接入独立支付状态日志，保留订单状态日志。"]]} />
              <DetailGroup title="错误信息" rows={[["异常类型", detail.exception_type ? getExceptionTypeLabel(detail.exception_type) : "—"], ["错误摘要", detail.error_summary ?? "—"]]} />
              {!underpaymentCredited && detail.exception_type ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"><div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" />重新查询渠道状态</div><p className="mt-1 text-xs">真实支付 Provider 尚未配置，当前操作不可用。</p></div> : null}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function Bep20ChainPaymentPanel({ detail, chainPayment, chainPaymentError, overpaymentWallet, copyText, onChanged }: { detail: AdminPaymentRecord; chainPayment: AdminBep20ChainPayment | null; chainPaymentError: string; overpaymentWallet: AdminBep20OverpaymentWallet; copyText: (value: string | null | undefined) => void; onChanged: () => Promise<void> }) {
  const [checking, setChecking] = useState(false);
  async function runChainAction(action: "recheck_bep20" | "approve_late_payment" | "reject_late_payment", promptText: string) {
    if (!chainPayment || checking) return;
    const reason = window.prompt(promptText)?.trim() ?? "";
    if (!reason) return;
    if (action !== "recheck_bep20" && !window.confirm(action === "approve_late_payment" ? "确认批准该笔晚到账支付？" : "确认拒绝该笔晚到账支付？")) return;
    setChecking(true);
    try {
      const response = await fetch(`/api/admin/payments/${detail.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, chainSessionId: chainPayment.sessionId, reason }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "链上支付操作失败");
      toast.success(action === "approve_late_payment" ? "晚到账支付已批准" : action === "reject_late_payment" ? "晚到账支付已拒绝" : "链上交易已重新核验");
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "链上支付操作失败");
    } finally {
      setChecking(false);
    }
  }
  async function creditOverpayment() {
    if (!chainPayment || checking || overpaymentWallet.disposition) return;
    const reason = window.prompt("请输入超额金额转入站内余额的原因：")?.trim() ?? "";
    if (!reason) return;
    if (!window.confirm("确认按该订单冻结汇率将超额 USDT 转为用户人民币余额？该操作不可撤销。")) return;
    setChecking(true);
    try {
      const response = await fetch(`/api/admin/payments/${encodeURIComponent(detail.id)}/overpayment-credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message || "超额金额转入余额失败");
      toast.success(payload?.idempotent ? "该超额金额此前已转入余额" : `已转入 ${payload?.credited_cny ?? "0"} CNY`);
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "超额金额转入余额失败");
    } finally {
      setChecking(false);
    }
  }
  if (chainPaymentError && !chainPayment) return <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{chainPaymentError}</div>;
  if (!chainPayment) return null;
  const manualReviewDecided = chainPayment.manualReviewDecision === "approved" || chainPayment.manualReviewDecision === "rejected";
  const hasOverpayment = compareUnsignedDecimal(chainPayment.confirmedAmount, chainPayment.expectedAmount) > 0;
  const canManageChainPayment = overpaymentWallet.authorized;
  const canCreditOverpayment = overpaymentWallet.authorized
    && overpaymentWallet.available
    && !overpaymentWallet.disposition
    && chainPayment.status === "paid"
    && chainPayment.manualReviewDecision === "approved"
    && hasOverpayment;
  const rows: Array<[string, string, (() => void)?]> = [
    ["网络", `${chainPayment.network} / Chain ID ${chainPayment.chainId}`], ["订单原金额", `${chainPayment.orderAmount} ${chainPayment.orderCurrency}`], ["汇率", `${chainPayment.exchangeRate} (${chainPayment.exchangeRateSource})`], ["汇率获取时间", formatDate(chainPayment.exchangeRateFetchedAt)], ["汇率有效期", formatDate(chainPayment.exchangeRateExpiresAt)], ["应付金额", `${chainPayment.expectedAmount} ${chainPayment.paymentCurrency}`], ["实际到账", chainPayment.confirmedAmount ? `${chainPayment.confirmedAmount} ${chainPayment.paymentCurrency}` : "—"], ["收款地址", chainPayment.receiveAddress, () => copyText(chainPayment.receiveAddress)], ["付款地址", chainPayment.transaction?.fromAddress ?? "—", chainPayment.transaction?.fromAddress ? () => copyText(chainPayment.transaction?.fromAddress) : undefined], ["TxHash", chainPayment.submittedTxHash ?? "—", chainPayment.submittedTxHash ? () => copyText(chainPayment.submittedTxHash) : undefined], ["区块号", chainPayment.transaction?.blockNumber ?? "—"], ["确认数", chainPayment.transaction?.confirmationCount == null ? "—" : String(chainPayment.transaction.confirmationCount)], ["USDT 合约", chainPayment.tokenContract, () => copyText(chainPayment.tokenContract)], ["支付会话状态", chainPayment.status], ["人工审核决策", chainPayment.manualReviewDecision ?? "—"], ["决策原因", chainPayment.manualReviewDecisionReason ?? "—"], ["决策时间", formatDate(chainPayment.manualReviewDecidedAt)], ["异常原因", chainPayment.failureReason ?? chainPayment.manualReviewReason ?? "—"], ["创建时间", formatDate(chainPayment.createdAt)], ["确认时间", formatDate(chainPayment.confirmedAt)], ["过期时间", formatDate(chainPayment.expiresAt)],
  ];
  return <section className="rounded-xl border"><div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"><div className="text-sm font-semibold text-slate-950">USDT-BEP20 链上明细</div><div className="flex flex-wrap gap-2">{canManageChainPayment ? <><Button size="sm" variant="outline" onClick={() => runChainAction("recheck_bep20", "请输入重新核验原因：")} disabled={checking || chainPayment.status === "paid" || !chainPayment.submittedTxHash || chainPayment.manualReviewDecision === "rejected"}>{checking ? "处理中..." : "重新核验"}</Button>{chainPayment.status === "manual_review" && !manualReviewDecided ? <><Button size="sm" onClick={() => runChainAction("approve_late_payment", "请输入批准晚到账的原因：")} disabled={checking}>批准晚到账</Button><Button size="sm" variant="destructive" onClick={() => runChainAction("reject_late_payment", "请输入拒绝晚到账的原因：")} disabled={checking}>拒绝晚到账</Button></> : null}</> : null}{canCreditOverpayment ? <Button size="sm" onClick={creditOverpayment} disabled={checking}>{checking ? "处理中..." : "超额转入余额"}</Button> : null}</div></div><div className="divide-y">{rows.map(([label, value, onCopy]) => <div key={label} className="flex items-start justify-between gap-4 px-4 py-3 text-sm"><span className="shrink-0 text-slate-500">{label}</span><button type="button" disabled={!onCopy} onClick={onCopy} className={cn("min-w-0 text-right text-slate-900", onCopy && "hover:text-primary")}><span className="break-all">{value || "—"}</span></button></div>)}</div>{overpaymentWallet.disposition ? <div className="border-t bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><div className="font-medium">超额金额已转入站内余额</div><div className="mt-1">{overpaymentWallet.disposition.overpaidUsdt} USDT × {overpaymentWallet.disposition.exchangeRate} = {overpaymentWallet.disposition.creditedCny} CNY</div><div className="mt-1 text-xs">处理方式：{overpaymentWallet.disposition.settlementSource === "automatic_service" ? "自动原子结算" : "管理员人工入账"}</div><div className="mt-1 text-xs">处理时间：{formatDate(overpaymentWallet.disposition.processedAt)}</div></div> : null}{overpaymentWallet.authorized && overpaymentWallet.error ? <div className="border-t px-4 py-3 text-sm text-amber-700">{overpaymentWallet.error}</div> : null}{chainPayment.explorerUrl && chainPayment.submittedTxHash ? <div className="border-t px-4 py-3 text-sm"><a href={chainPayment.explorerUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">在 BscScan 查看交易</a></div> : null}{chainPaymentError ? <div className="border-t px-4 py-3 text-sm text-amber-700">{chainPaymentError}</div> : null}</section>;
}

function RechargeReviewOverlay({ rechargeId, onChanged }: { rechargeId: string; onChanged: () => Promise<void> }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/recharges/${rechargeId}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "充值审核信息读取失败。");
      setData(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "充值审核信息读取失败。"); }
    finally { setLoading(false); }
  }, [rechargeId]);
  useEffect(() => { void load(); }, [load]);
  async function action(name: string, needsReason = true) {
    const reason = needsReason ? window.prompt("请输入本次操作原因：")?.trim() ?? "" : "";
    if (needsReason && !reason) return;
    if (name === "approve" && !window.confirm("确认真实款项已经到账，并执行原子余额入账？")) return;
    setActing(true);
    try {
      const response = await fetch(`/api/admin/recharges/${rechargeId}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: name, reason }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "充值审核操作失败。");
      toast.success(payload.idempotent ? "该充值已处理，本次未重复入账" : "充值审核操作已完成");
      await load(); await onChanged();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "充值审核操作失败。"); }
    finally { setActing(false); }
  }
  const recharge = data?.recharge;
  const status = String(recharge?.status ?? "");
  return <div className="fixed bottom-4 right-5 z-[60] max-h-[48vh] w-[min(640px,calc(100vw-2rem))] overflow-auto rounded-xl border bg-white p-4 shadow-2xl"><div className="mb-3 flex items-center justify-between"><div><div className="font-semibold text-slate-950">充值审核</div><div className="text-xs text-slate-500">{recharge?.recharge_no ?? rechargeId}</div></div><Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>刷新</Button></div>{error ? <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div> : loading ? <div className="py-6 text-center text-sm text-slate-500">正在读取审核信息...</div> : <div className="space-y-3"><div className="grid grid-cols-2 gap-2 text-xs text-slate-600"><div>状态：{status || "—"}</div><div>历史充值：{data?.historyCount ?? 0} 笔</div><div>交易流水号：{recharge?.transaction_reference ?? "—"}</div><div>付款时间：{formatDate(recharge?.payment_time)}</div><div className="col-span-2">付款账号摘要：{recharge?.payer_account_summary ?? "—"}</div></div><div className="flex flex-wrap gap-2">{(data?.proofs ?? []).map((proof: any) => <Button key={proof.url} asChild size="sm" variant="outline"><a href={proof.url} target="_blank" rel="noreferrer">{proof.name}</a></Button>)}</div><div className="flex flex-wrap gap-2">{status === "submitted" ? <Button size="sm" disabled={acting} onClick={() => void action("start_review", false)}>开始审核</Button> : null}{status === "reviewing" ? <><Button size="sm" disabled={acting} onClick={() => void action("approve")}>审核通过并入账</Button><Button size="sm" variant="outline" disabled={acting} onClick={() => void action("request_more_proof")}>要求补充凭证</Button><Button size="sm" variant="destructive" disabled={acting} onClick={() => void action("reject")}>驳回</Button></> : null}{["approved", "failed"].includes(status) ? <Button size="sm" disabled={acting} onClick={() => void action("retry_credit")}>重新处理入账</Button> : null}{["pending", "waiting_payment", "submitted", "reviewing", "rejected", "failed"].includes(status) ? <Button size="sm" variant="outline" disabled={acting} onClick={() => void action("cancel")}>取消充值</Button> : null}</div></div>}</div>;
}

function CallbackRecords({ callbacks, callbackError }: { callbacks: AdminPaymentCallback[]; callbackError: string }) {
  return <section className="rounded-xl border"><div className="border-b px-4 py-3 text-sm font-semibold text-slate-950">回调记录</div>{callbackError ? <div className="px-4 py-3 text-sm text-amber-700">{callbackError}</div> : null}{callbacks.length ? <div className="max-h-72 overflow-auto"><table className="w-full min-w-[760px] text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><Th>回调 ID</Th><Th>支付渠道</Th><Th>支付单号</Th><Th>渠道交易号</Th><Th>验签结果</Th><Th>处理结果</Th><Th>HTTP</Th><Th>重复</Th><Th>接收时间</Th></tr></thead><tbody>{callbacks.map((item) => <tr key={item.id} className="border-t"><Td mono>{item.id}</Td><Td>{getPaymentChannelLabel(item.channel)}</Td><Td mono>{item.payment_no ?? "—"}</Td><Td mono>{item.provider_trade_no ? maskWallet(item.provider_trade_no) : "—"}</Td><Td>{item.signature_result ?? "—"}</Td><Td>{item.process_result ?? "—"}</Td><Td>{item.http_status ?? "—"}</Td><Td>{item.is_duplicate ? "是" : "否"}</Td><Td>{formatDate(item.received_at)}</Td></tr>)}</tbody></table></div> : !callbackError ? <div className="px-4 py-6 text-sm text-slate-500">暂无回调记录</div> : null}</section>;
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) { return <th className={cn("h-10 whitespace-nowrap px-3 text-left font-medium", className)}>{children}</th>; }
function Td({ children, className, mono, title }: { children: React.ReactNode; className?: string; mono?: boolean; title?: string }) { return <td title={title} className={cn("truncate whitespace-nowrap px-3 py-3 align-middle text-slate-700", mono && "font-mono text-xs", className)}>{children}</td>; }
function DetailGroup({ title, rows }: { title: string; rows: Array<[string, string, (() => void)?]> }) { return <section className="rounded-xl border"><div className="border-b px-4 py-3 text-sm font-semibold text-slate-950">{title}</div><div className="divide-y">{rows.map(([label, value, onCopy]) => <div key={label} className="flex items-start justify-between gap-4 px-4 py-3 text-sm"><span className="shrink-0 text-slate-500">{label}</span><button type="button" disabled={!onCopy} onClick={onCopy} className={cn("min-w-0 text-right text-slate-900", onCopy && "hover:text-primary")}><span className="break-all">{value || "—"}</span></button></div>)}</div></section>; }
function DetailSkeleton() { return <div className="space-y-3">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}</div>; }
