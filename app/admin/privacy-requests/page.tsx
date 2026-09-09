"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, RefreshCw, Search } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import {
  AdminFilterBar,
  AdminListPagination,
  AdminListStat,
  AdminListStats,
  AdminListSurface,
  AdminTableViewport,
  adminListControlClass,
  adminListRowClass,
  adminListTableHeadClass,
} from "@/components/admin/v2/AdminList";
import AdminStatusBadge, { type AdminStatusTone } from "@/components/admin/v2/AdminStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;
const STATUS_LABELS: Record<string, string> = {
  requested: "已提交", verifying: "校验中", blocked: "有阻塞项", approved: "已批准",
  processing: "处理中", completed: "已完成", cancelled: "已取消", failed: "失败",
};
const TYPE_LABELS: Record<string, string> = { data_export: "数据导出", account_deletion: "账号注销" };
const SORT_VALUES = new Set(["newest", "oldest", "recently_updated"]);

type PrivacyRow = {
  id: string;
  requestNo: string;
  userId: string;
  userEmail: string | null;
  userLabel: string;
  requestType: string;
  status: string;
  blockReasons: string[];
  createdAt: string | null;
  updatedAt: string | null;
};

type PrivacyResponse = {
  requests?: PrivacyRow[];
  total?: number;
  stats?: { pending: number; processing: number; completed: number; closed: number };
  error?: string;
};

function useDebouncedValue(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

export default function AdminPrivacyRequestsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [rows, setRows] = useState<PrivacyRow[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ pending: 0, processing: 0, completed: 0, closed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [status, setStatus] = useState(normalizeFilter(params.get("status"), STATUS_LABELS));
  const [type, setType] = useState(normalizeFilter(params.get("type"), TYPE_LABELS));
  const [startAt, setStartAt] = useState(params.get("startAt") ?? "");
  const [endAt, setEndAt] = useState(params.get("endAt") ?? "");
  const [sort, setSort] = useState(SORT_VALUES.has(params.get("sort") ?? "") ? params.get("sort")! : "newest");
  const [page, setPage] = useState(positivePage(params.get("page")));
  const debouncedSearch = useDebouncedValue(search);

  const queryString = useMemo(() => {
    const next = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sort });
    if (debouncedSearch.trim()) next.set("search", debouncedSearch.trim());
    if (status !== "all") next.set("status", status);
    if (type !== "all") next.set("type", type);
    if (startAt) next.set("startAt", startAt);
    if (endAt) next.set("endAt", endAt);
    return next.toString();
  }, [debouncedSearch, endAt, page, sort, startAt, status, type]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/privacy-requests?" + queryString, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as PrivacyResponse;
      if (!response.ok) throw new Error(payload.error || "隐私请求读取失败。");
      setRows(payload.requests ?? []);
      setTotal(payload.total ?? 0);
      setStats(payload.stats ?? { pending: 0, processing: 0, completed: 0, closed: 0 });
    } catch (loadError) {
      setRows([]);
      setTotal(0);
      setStats({ pending: 0, processing: 0, completed: 0, closed: 0 });
      setError(loadError instanceof Error ? loadError.message : "隐私请求读取失败。");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    router.replace(pathname + "?" + queryString, { scroll: false });
    void loadRows();
  }, [loadRows, pathname, queryString, router]);

  useEffect(() => {
    setSearch(params.get("search") ?? "");
    setStatus(normalizeFilter(params.get("status"), STATUS_LABELS));
    setType(normalizeFilter(params.get("type"), TYPE_LABELS));
    setStartAt(params.get("startAt") ?? "");
    setEndAt(params.get("endAt") ?? "");
    setSort(SORT_VALUES.has(params.get("sort") ?? "") ? params.get("sort")! : "newest");
    setPage(positivePage(params.get("page")));
  }, [params]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(debouncedSearch || status !== "all" || type !== "all" || startAt || endAt || sort !== "newest");
  const reset = () => {
    setSearch("");
    setStatus("all");
    setType("all");
    setStartAt("");
    setEndAt("");
    setSort("newest");
    setPage(1);
  };

  return (
    <AdminPageShell
      variant="v2"
      title="隐私请求"
      description="只读查询数据导出与账号注销请求、处理时间线和审计记录。"
      actions={<Button className="h-11 sm:h-9" variant="outline" onClick={() => void loadRows()} disabled={loading}><RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />{loading ? "刷新中..." : "刷新"}</Button>}
    >
      <AdminListStats>
        <AdminListStat label="当前待处理" value={stats.pending} tone={stats.pending > 0 ? "warning" : "neutral"} />
        <AdminListStat label="处理中" value={stats.processing} />
        <AdminListStat label="已完成" value={stats.completed} />
        <AdminListStat label="已拒绝 / 取消" value={stats.closed} />
      </AdminListStats>

      <AdminListSurface>
        <AdminFilterBar
          className="sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-[minmax(220px,1fr)_150px_150px_150px_150px_170px_76px]"
          primary={<>
            <label className="relative sm:col-span-2 lg:col-span-2 2xl:col-span-1"><span className="sr-only">搜索隐私请求</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="申请编号、说明或 UUID" className={cn(adminListControlClass, "pl-9")} /></label>
            <Select label="状态" value={status} onChange={(value) => { setStatus(value); setPage(1); }}><option value="all">全部状态</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
            <Select label="类型" value={type} onChange={(value) => { setType(value); setPage(1); }}><option value="all">全部类型</option>{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
          </>}
          advanced={<>
            <Input aria-label="提交开始日期" type="date" value={startAt} onChange={(event) => { setStartAt(event.target.value); setPage(1); }} className={adminListControlClass} />
            <Input aria-label="提交结束日期" type="date" value={endAt} onChange={(event) => { setEndAt(event.target.value); setPage(1); }} className={adminListControlClass} />
            <Select label="排序" value={sort} onChange={(value) => { setSort(value); setPage(1); }}><option value="newest">最新提交</option><option value="oldest">最早提交</option><option value="recently_updated">最近更新</option></Select>
            <Button variant="outline" className="h-11 sm:h-9" onClick={reset}>重置</Button>
          </>}
        />

        <AdminTableViewport>
          {error ? <AdminErrorState title="隐私请求加载失败" description={error} onRetry={() => void loadRows()} /> : loading ? <AdminTableSkeleton rows={10} /> : rows.length === 0 ? <AdminEmptyState title={hasFilters ? "没有符合条件的隐私请求" : "暂无隐私请求"} description={hasFilters ? "请调整筛选条件后再试。" : "用户提交隐私请求后会显示在这里。"} /> : (
            <table className="w-full min-w-[1180px] table-fixed text-sm">
              <colgroup><col className="w-[190px]" /><col className="w-[240px]" /><col className="w-[120px]" /><col className="w-[110px]" /><col className="w-[240px]" /><col className="w-[150px]" /><col className="w-[150px]" /><col className="w-[80px]" /></colgroup>
              <thead className={adminListTableHeadClass}><tr className="border-b">{["请求编号", "用户", "类型", "状态", "阻塞原因", "提交时间", "最近更新", "操作"].map((heading) => <th scope="col" key={heading} className="h-10 whitespace-nowrap px-3 font-medium">{heading}</th>)}</tr></thead>
              <tbody>{rows.map((row) => <tr key={row.id} className={adminListRowClass}>
                <td className="px-3 py-2"><div className="truncate font-medium text-slate-900">{row.requestNo || "—"}</div><div className="truncate font-mono text-[11px] text-slate-400" title={row.id}>{row.id}</div></td>
                <td className="px-3 py-2"><div className="truncate" title={row.userEmail ?? ""}>{row.userEmail || row.userLabel || "—"}</div><div className="truncate font-mono text-[11px] text-slate-400">{row.userId || "—"}</div></td>
                <td className="px-3 py-2">{TYPE_LABELS[row.requestType] ?? row.requestType}</td>
                <td className="px-3 py-2"><StatusBadge value={row.status} /></td>
                <td className="truncate px-3 py-2 text-slate-500" title={row.blockReasons.join("；")}>{row.blockReasons.length ? row.blockReasons.join("；") : "—"}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-slate-500">{formatDate(row.createdAt)}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-slate-500">{formatDate(row.updatedAt)}</td>
                <td className="px-3 py-2"><Button asChild variant="ghost" size="sm" className="min-h-11 sm:min-h-9"><Link href={"/admin/privacy-requests/" + row.id}><Eye className="mr-1 h-4 w-4" />查看</Link></Button></td>
              </tr>)}</tbody>
            </table>
          )}
        </AdminTableViewport>
        <AdminListPagination summary={`共 ${total} 条`} page={page} totalPages={totalPages} loading={loading} onPrevious={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(totalPages, value + 1))} />
      </AdminListSurface>
    </AdminPageShell>
  );
}

function Select({ children, label, value, onChange }: { children: React.ReactNode; label: string; value: string; onChange: (value: string) => void }) {
  return <select aria-label={label} className={cn(adminListControlClass, "px-3 outline-none")} value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>;
}
function StatusBadge({ value }: { value: string }) {
  const good = value === "completed";
  const pending = ["requested", "verifying", "blocked", "approved", "processing"].includes(value);
  const tone: AdminStatusTone = good ? "success" : pending ? "warning" : "neutral";
  return <AdminStatusBadge tone={tone}>{STATUS_LABELS[value] ?? value}</AdminStatusBadge>;
}
function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false });
}
function normalizeFilter(value: string | null, labels: Record<string, string>) {
  return value && Object.hasOwn(labels, value) ? value : "all";
}
function positivePage(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}
