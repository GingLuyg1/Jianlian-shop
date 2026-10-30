"use client";

import { useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import RechargeEmptyState from "@/components/account/RechargeEmptyState";
import RecordLoginState from "@/components/account/RecordLoginState";
import RecordLoadingPlaceholder from "@/components/account/RecordLoadingPlaceholder";
import { accountRecordPreload, AccountRecordsError } from "@/lib/account/record-preload";
import { useAccountRecordIdentity } from "@/hooks/use-account-record-identity";

type Transaction = {
  transactionNo: string; businessType: string; businessId: string;
  direction: "credit" | "debit"; amount: number; currency: string;
  balanceBefore: number | null; balanceAfter: number | null;
  status: string; remark: string | null; subtype: string | null;
  createdAt: string | null;
};
const types: Record<string, string> = {
  account_recharge: "充值入账", order_payment: "订单消费", admin_adjustment: "管理员调整",
  refund: "订单退款", promotion: "推广收益", system: "系统处理",
};
const statuses: Record<string, string> = { completed: "已完成", pending: "处理中", processing: "处理中", failed: "失败", cancelled: "已取消", rejected: "已拒绝", success: "已成功" };
function money(value: number, currency: string) {
  return currency === "USDT" ? `${Number(value).toFixed(6)} USDT` : `¥${Number(value).toFixed(2)}`;
}

async function copyProductName(fullName: string) {
  try {
    await navigator.clipboard.writeText(fullName);
    toast.success("商品名称已复制");
  } catch { toast.error("复制失败，请手动复制商品名称"); }
}

function BalanceRemark({ value }: { value: string | null }) {
  const meaningfulLines = value?.split(/\r?\n/).map((line) => line.trim()).filter((line) =>
    line && !/^订单余额支付[。！!]?$/u.test(line) && !/测试环境|测试余额充值/u.test(line)
  );
  if (!meaningfulLines?.length) return null;
  return <p className="mt-3 whitespace-pre-line break-words border-t border-[#f1e9e0] pt-3 text-xs leading-5 text-[#8e7f71]">{meaningfulLines.join("\n")}</p>;
}

export default function BalanceTransactionRecords() {
  const identity = useAccountRecordIdentity();
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Transaction[]>(() => accountRecordPreload.peek<Transaction>("balance", 1)?.data ?? []);
  const [count, setCount] = useState(() => accountRecordPreload.peek("balance", 1)?.count ?? 0);
  const [loading, setLoading] = useState(() => !accountRecordPreload.peek("balance", 1));
  const loadingCount = accountRecordPreload.countHint("balance", page);
  const [viewKey, setViewKey] = useState(() => accountRecordPreload.peek("balance", 1) ? `${accountRecordPreload.getSnapshot().epoch}:1` : "");
  const ownerMatches = viewKey === `${identity.epoch}:${page}`;
  const requestId = useRef(0);
  const forceReload = useRef(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [namesLoading, setNamesLoading] = useState(false);
  useEffect(() => {
    if (identity.status !== "signed-in" || !ownerMatches) { setProductNames({}); setNamesLoading(false); return; }
    const purchases = rows.filter((item) => item.businessType === "order_payment");
    if (!purchases.length) { setProductNames({}); setNamesLoading(false); return; }
    let mounted = true;
    setProductNames({}); setNamesLoading(true);
    // Existing authenticated GET only. Bound the lookup to one order page;
    // never scan all history or make a request for each transaction.
    void accountRecordPreload.loadOrderProductNames(purchases.map(item => item.businessId))
      .then((result) => {
        if (!mounted) return;
        const names: Record<string, string> = {};
        for (const item of purchases) {
          const title = result[item.businessId];
          if (title) names[item.transactionNo] = title;
        }
        setProductNames(names);
      }).catch(() => { /* The transaction remains usable when order lookup fails. */ })
      .finally(() => { if (mounted) setNamesLoading(false); });
    return () => { mounted = false; };
  }, [rows, identity.epoch, identity.status, ownerMatches]);
  useEffect(() => {
    const currentRequest = ++requestId.current;
    if (identity.status !== "signed-in") return;
    const epoch = identity.epoch;
    const nextKey = `${epoch}:${page}`;
    const force = forceReload.current;
    forceReload.current = false;
    const cached = !force && accountRecordPreload.peek<Transaction>("balance", page);
    if (cached) {
      setRows(cached.data); setCount(cached.count); setViewKey(nextKey);
      setLoading(false); setError("");
      return;
    }
    let mounted = true;
    const isCurrent = () => mounted && currentRequest === requestId.current && accountRecordPreload.getSnapshot().epoch === epoch;
    setLoading(true); setError("");
    void (async () => {
      try {
        const result = await accountRecordPreload.load<Transaction>("balance", page, force);
        if (!isCurrent()) return;
        setRows(result.data); setCount(result.count); setViewKey(nextKey);
      } catch (cause) {
        if (!isCurrent()) return;
        setRows([]); setCount(0); setViewKey(nextKey);
        setError(cause instanceof AccountRecordsError && cause.status === 503 ? "资金变动记录服务暂不可用，请稍后重试。" : cause instanceof Error ? cause.message : "资金变动记录加载失败，请重试。");
      } finally { if (isCurrent()) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [page, retry, identity.epoch, identity.status]);
  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState === "visible" && identity.status === "signed-in" && !accountRecordPreload.peek("balance", page)) setRetry(value => value + 1);
    };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => { window.removeEventListener("focus", revalidate); document.removeEventListener("visibilitychange", revalidate); };
  }, [identity.status, page]);
  const pages = Math.max(1, Math.ceil(count / 10));
  if (identity.status === "anonymous") return <RecordLoginState variant="balance" />;
  if (identity.status === "checking" || !ownerMatches) return <div className="mt-4 flex min-w-0 flex-1 flex-col"><RecordLoadingPlaceholder count={loadingCount} label="资金变动记录加载中" /></div>;
  return <div className="mt-4 flex min-w-0 flex-1 flex-col md:min-h-0" aria-busy={loading}>
    <div className="flex min-w-0 flex-1 flex-col md:min-h-0 md:overflow-y-auto">
      {loading ? <RecordLoadingPlaceholder count={loadingCount} label="资金变动记录加载中" /> : error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600"><p>{error}</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => { forceReload.current = true; setRetry((value) => value + 1); }}>重试</Button></div></div> : rows.length === 0 ? <RechargeEmptyState variant="balance" title="暂无资金变动记录" /> : <div className="space-y-3">{rows.map((item) => <article key={item.transactionNo} className="min-w-0 rounded-2xl border border-[#eee4d9] bg-white p-4 text-sm shadow-[0_2px_10px_-8px_rgba(91,62,38,0.25)]">
        <div className="font-semibold">{item.subtype === "bep20_underpayment_wallet_credit" ? "BEP20 欠额转余额" : types[item.businessType] ?? item.businessType}</div>
        <dl className="mt-3 space-y-2 text-xs text-slate-500">
          <div className="flex items-center justify-between gap-2"><dt className="shrink-0">变动金额</dt><dd className={item.direction === "credit" ? "whitespace-nowrap text-base font-semibold tabular-nums text-emerald-600" : "whitespace-nowrap text-base font-semibold tabular-nums text-red-600"}>{item.direction === "credit" ? "+" : "-"}{money(item.amount, item.currency)}</dd></div>
          {item.businessType === "order_payment" ? <div data-testid="balance-product-block" className="min-w-0 rounded-xl border border-[#f0e8de] bg-[#fbf8f4] px-3 py-2.5"><dt className="mb-1 text-[11px] text-[#9a8a7b]">商品名称</dt><dd className="flex h-6 min-w-0 items-center gap-2 overflow-hidden"><span data-testid="balance-product-name" title={productNames[item.transactionNo] ?? (namesLoading ? "读取中…" : "商品名称暂不可用")} className="block min-w-0 flex-1 truncate leading-6 text-slate-700">{productNames[item.transactionNo] ?? (namesLoading ? "读取中…" : "商品名称暂不可用")}</span><Button type="button" size="icon" variant="ghost" className="h-6 w-6 shrink-0 p-0 text-[#a18b77]" aria-label="复制完整商品名称" title="复制完整商品名称" disabled={!productNames[item.transactionNo]} onClick={() => void copyProductName(productNames[item.transactionNo])}><Copy className="h-3 w-3" /></Button></dd></div> : null}
          <div className="flex justify-between gap-2"><dt className="shrink-0">变动时间</dt><dd className="text-right">{item.createdAt ? new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false }) : "—"}</dd></div>
          <div className="flex justify-between gap-2"><dt className="shrink-0">处理状态</dt><dd>{statuses[item.status] ?? item.status}</dd></div>
          {item.balanceBefore != null || item.balanceAfter != null ? <div className="flex justify-between gap-2"><dt>余额</dt><dd className="text-right">{item.balanceBefore == null ? "—" : money(item.balanceBefore, item.currency)} → {item.balanceAfter == null ? "—" : money(item.balanceAfter, item.currency)}</dd></div> : null}
        </dl>
        <BalanceRemark value={item.remark} />
      </article>)}</div>}
    </div>
    {!loading && !error && count > 10 ? <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground"><span>共 {count} 条</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</Button><span>{page} / {pages}</span><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>下一页</Button></div></div> : null}
  </div>;
}
