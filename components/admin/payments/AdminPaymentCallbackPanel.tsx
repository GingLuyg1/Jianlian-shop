"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminPaymentCallback } from "@/lib/payments/admin-payment-types";
import { getPaymentChannelLabel, maskWallet } from "@/lib/payments/admin-payment-types";
import { formatDateTime } from "@/lib/i18n/datetime";

type Payload = { callbacks?: AdminPaymentCallback[]; count?: number; error?: string };
type Props = { attention: "all" | "failed"; onAttentionChange: (attention: "all" | "failed") => void };
const PAGE_SIZE = 20;

export default function AdminPaymentCallbackPanel({ attention, onAttentionChange }: Props) {
  const [rows, setRows] = useState<AdminPaymentCallback[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), search: debouncedSearch, attention });
      const response = await fetch(`/api/admin/payments/callbacks?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as Payload | null;
      if (!response.ok) throw new Error(payload?.error ?? "支付回调记录加载失败");
      setRows(payload?.callbacks ?? []);
      setCount(Number(payload?.count ?? 0));
    } catch (loadError) {
      setRows([]);
      setCount(0);
      setError(loadError instanceof Error ? loadError.message : "支付回调记录加载失败");
    } finally {
      setLoading(false);
    }
  }, [attention, debouncedSearch, page]);

  useEffect(() => { void loadRows(); }, [loadRows]);

  return (
    <>
      <div className="grid shrink-0 gap-2 border-b px-4 py-3 md:grid-cols-[minmax(220px,1fr)_170px_86px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="支付单号 / 渠道交易号" className="h-9 pl-9" />
        </div>
        <select value={attention} onChange={(event) => { onAttentionChange(event.target.value === "failed" ? "failed" : "all"); setPage(1); }} className="h-9 rounded-md border bg-white px-3 text-sm">
          <option value="all">全部回调</option>
          <option value="failed">仅处理失败</option>
        </select>
        <Button variant="outline" size="sm" onClick={() => { setSearch(""); onAttentionChange("all"); setPage(1); }}>重置</Button>
      </div>
      {error ? <div className="min-h-0 flex-1 p-4"><AdminErrorState description={error} onRetry={loadRows} /></div>
        : loading ? <AdminTableSkeleton rows={8} />
          : rows.length === 0 ? <div className="min-h-0 flex-1 p-4"><AdminEmptyState title={attention === "failed" ? "暂无失败回调" : "暂无回调记录"} description="这里仅展示真实支付回调记录。" /></div>
            : <div className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[980px] text-sm"><thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs text-slate-500"><tr><Th>回调 ID</Th><Th>渠道</Th><Th>支付单号</Th><Th>渠道交易号</Th><Th>验签</Th><Th>处理结果</Th><Th>HTTP</Th><Th>重复</Th><Th>接收时间</Th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t hover:bg-slate-50"><Td mono>{row.id}</Td><Td>{getPaymentChannelLabel(row.channel)}</Td><Td mono>{row.payment_no ?? "—"}</Td><Td mono>{row.provider_trade_no ? maskWallet(row.provider_trade_no) : "—"}</Td><Td>{row.signature_result ?? "—"}</Td><Td>{row.process_result ?? "—"}</Td><Td>{row.http_status ?? "—"}</Td><Td>{row.is_duplicate ? "是" : "否"}</Td><Td>{row.received_at ? formatDateTime(row.received_at) : "—"}</Td></tr>)}</tbody></table></div>}
      <div className="flex h-12 shrink-0 items-center justify-between border-t px-4 text-sm text-slate-500"><span>共 {count} 条记录</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</Button><span>第 {page} / {totalPages} 页</span><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>下一页</Button></div></div>
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) { return <th className="whitespace-nowrap px-3 py-3 font-medium">{children}</th>; }
function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) { return <td className={mono ? "whitespace-nowrap px-3 py-3 font-mono text-xs" : "whitespace-nowrap px-3 py-3 text-slate-700"}>{children}</td>; }
