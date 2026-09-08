"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw, Search, ShieldAlert } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RiskEvent = {
  id: string; ruleCode: string; riskLevel: string; riskScore: number; recommendedAction: string;
  businessType: string; businessId: string | null; userId: string | null; requestId: string | null;
  sourceHash: string | null; summary: string; status: string; occurrences: number;
  firstSeenAt: string | null; lastSeenAt: string | null; createdAt: string | null; updatedAt: string | null;
};
type RiskStats = { pending: number; high: number; today: number; processed: number };

const LEVELS = [["all", "全部等级"], ["low", "低"], ["medium", "中"], ["high", "高"], ["critical", "严重"]] as const;
const STATUSES = [["all", "全部状态"], ["open", "未处理"], ["pending", "待审核"], ["reviewing", "审核中"], ["monitoring", "观察中"], ["approved", "已批准"], ["rejected", "已拒绝"], ["resolved", "已解除"], ["expired", "已过期"], ["cancelled", "已取消"]] as const;
const BUSINESS_TYPES = [["all", "全部业务"], ["account", "账户"], ["login", "登录"], ["order", "订单"], ["inventory", "库存"], ["payment", "支付"], ["recharge", "充值"], ["refund", "退款"], ["delivery", "交付"]] as const;
const SORTS = [["newest", "最近发现"], ["oldest", "最早发现"], ["risk_desc", "风险分数从高到低"], ["risk_asc", "风险分数从低到高"]] as const;
const PAGE_SIZE = 20;

function useDebouncedValue(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(value), delay); return () => window.clearTimeout(timer); }, [delay, value]);
  return debounced;
}

export default function AdminRiskPage() {
  const router = useRouter();
  const pathname = usePathname();
  const initial = useSearchParams();
  const [events, setEvents] = useState<RiskEvent[]>([]);
  const [stats, setStats] = useState<RiskStats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(initial.get("search") ?? "");
  const [level, setLevel] = useState(initial.get("level") ?? "all");
  const [status, setStatus] = useState(initial.get("status") ?? "all");
  const [businessType, setBusinessType] = useState(initial.get("businessType") ?? "all");
  const [startAt, setStartAt] = useState(initial.get("startAt") ?? "");
  const [endAt, setEndAt] = useState(initial.get("endAt") ?? "");
  const [sort, setSort] = useState(initial.get("sort") ?? "newest");
  const [page, setPage] = useState(Math.max(Number(initial.get("page") ?? 1) || 1, 1));
  const debouncedSearch = useDebouncedValue(search);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    params.set("sort", sort);
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (level !== "all") params.set("level", level);
    if (status !== "all") params.set("status", status);
    if (businessType !== "all") params.set("businessType", businessType);
    if (startAt) params.set("startAt", startAt);
    if (endAt) params.set("endAt", endAt);
    return params.toString();
  }, [businessType, debouncedSearch, endAt, level, page, sort, startAt, status]);

  const loadRisk = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/risk?${queryString}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "风险事件读取失败");
      setEvents(Array.isArray(payload.events) ? payload.events : []);
      setStats(payload.stats ?? null);
      setTotal(Number(payload.total ?? 0));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "风险事件读取失败");
      setEvents([]); setStats(null); setTotal(0);
    } finally { setLoading(false); }
  }, [queryString]);

  useEffect(() => { router.replace(`${pathname}?${queryString}`, { scroll: false }); void loadRisk(); }, [loadRisk, pathname, queryString, router]);
  useEffect(() => { setPage(1); }, [businessType, debouncedSearch, endAt, level, sort, startAt, status]);

  const resetFilters = () => { setSearch(""); setLevel("all"); setStatus("all"); setBusinessType("all"); setStartAt(""); setEndAt(""); setSort("newest"); setPage(1); };
  const hasFilters = Boolean(debouncedSearch || level !== "all" || status !== "all" || businessType !== "all" || startAt || endAt || sort !== "newest");
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cards = [["当前待审核", stats?.pending ?? 0], ["高风险", stats?.high ?? 0], ["今日新增", stats?.today ?? 0], ["已处理", stats?.processed ?? 0]] as const;

  return (
    <AdminPageShell title="风险审核中心" description="只读查看风险事件、关联业务、证据摘要与历史审核记录。当前审核写动作尚未达到安全开放标准。" actions={<Button variant="outline" onClick={() => void loadRisk()} disabled={loading}><RefreshCcw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />{loading ? "刷新中..." : "刷新"}</Button>}>
      <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-sm text-slate-500">{label}</span><ShieldAlert className="h-4 w-4 text-slate-400" /></div><div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div></div>)}
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="shrink-0 border-b border-slate-100 p-3">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-[minmax(180px,1fr)_128px_138px_138px_168px_168px_180px_76px]">
            <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="记录号 / 规则 / 业务号 / 请求号" className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-primary" /></label>
            <Select value={level} onChange={setLevel} options={LEVELS} />
            <Select value={status} onChange={setStatus} options={STATUSES} />
            <Select value={businessType} onChange={setBusinessType} options={BUSINESS_TYPES} />
            <input aria-label="开始时间" type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-primary" />
            <input aria-label="结束时间" type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-primary" />
            <Select value={sort} onChange={setSort} options={SORTS} />
            <button type="button" onClick={resetFilters} className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50">重置</button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {error ? <AdminErrorState title="风险事件加载失败" description={error} onRetry={() => void loadRisk()} /> : loading ? <AdminTableSkeleton rows={8} /> : events.length === 0 ? <AdminEmptyState title={hasFilters ? "没有符合条件的风险事件" : "暂无风险事件"} description={hasFilters ? "请调整筛选条件后再试。" : "真实风险事件产生后会显示在这里。"} /> : (
            <table className="w-full min-w-[1280px] table-fixed text-sm">
              <colgroup><col className="w-[148px]" /><col className="w-[130px]" /><col className="w-[190px]" /><col className="w-[130px]" /><col className="w-[110px]" /><col className="w-[220px]" /><col className="w-[100px]" /><col className="w-[150px]" /><col className="w-[78px]" /></colgroup>
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs text-slate-500"><tr className="border-b">{["风险记录号", "关联用户", "关联业务", "风险类型", "等级 / 分数", "风险原因", "状态", "最后发现", "操作"].map((heading) => <th key={heading} className="h-10 px-3 font-medium whitespace-nowrap">{heading}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{events.map((event) => <tr key={event.id} className="hover:bg-slate-50">
                <td className="truncate px-3 py-2 font-mono text-xs" title={event.id}>{event.id}</td>
                <td className="px-3 py-2">{event.userId ? <Link className="font-mono text-xs text-primary hover:underline" href={`/admin/users?search=${encodeURIComponent(event.userId)}`}>{shortId(event.userId)}</Link> : "—"}</td>
                <td className="px-3 py-2"><div>{businessLabel(event.businessType)}</div>{event.businessId ? (businessHref(event) ? <Link className="block truncate font-mono text-xs text-primary hover:underline" href={businessHref(event)!}>{event.businessId}</Link> : <span className="block truncate font-mono text-xs text-slate-500">{event.businessId}</span>) : <span className="text-xs text-slate-400">—</span>}</td>
                <td className="truncate px-3 py-2 font-mono text-xs" title={event.ruleCode}>{event.ruleCode}</td>
                <td className="px-3 py-2"><RiskBadge level={event.riskLevel} score={event.riskScore} /></td>
                <td className="px-3 py-2"><div className="line-clamp-2" title={event.summary}>{event.summary}</div><div className="mt-1 text-xs text-slate-400">建议：{event.recommendedAction}</div></td>
                <td className="px-3 py-2">{statusLabel(event.status)}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-slate-500">{formatDate(event.lastSeenAt)}</td>
                <td className="px-3 py-2"><Link href={`/admin/risk/${event.id}`} className="font-medium text-primary hover:underline">查看</Link></td>
              </tr>)}</tbody>
            </table>
          )}
        </div>
        <div className="flex h-12 shrink-0 items-center justify-between border-t border-slate-100 px-3 text-sm text-slate-500"><span>共 {total} 条，第 {page} / {totalPages} 页</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</Button><Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>下一页</Button></div></div>
      </div>
    </AdminPageShell>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: readonly (readonly [string, string])[] }) { return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary">{options.map(([option, label]) => <option key={option} value={option}>{label}</option>)}</select>; }
function RiskBadge({ level, score }: { level: string; score: number }) { const cls = level === "critical" || level === "high" ? "bg-red-50 text-red-700 ring-red-200" : level === "medium" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"; return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ring-1 ${cls}`}>{level} · {score}</span>; }
function businessLabel(value: string) { return Object.fromEntries(BUSINESS_TYPES)[value] ?? value; }
function statusLabel(value: string) { return Object.fromEntries(STATUSES)[value] ?? value; }
function shortId(value: string) { return `${value.slice(0, 8)}…`; }
function businessHref(event: RiskEvent) { const search = encodeURIComponent(event.businessId ?? ""); if (event.businessType === "order") return `/admin/orders?search=${search}`; if (event.businessType === "payment") return `/admin/payments?search=${search}`; if (event.businessType === "recharge") return `/admin/recharges?search=${search}`; if (event.businessType === "account" || event.businessType === "login") return `/admin/users?search=${encodeURIComponent(event.userId ?? event.businessId ?? "")}`; return undefined; }
function formatDate(value: string | null) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false }); }
