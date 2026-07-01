"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BarChart3, RefreshCcw, Search } from "lucide-react";

type PerformanceRow = {
  id: string;
  level: string;
  operation: string;
  route: string | null;
  queryType: string;
  resultCount: number | null;
  durationMs: number | null;
  status: string;
  occurrences: number;
  lastSeenAt: string;
  message: string;
};

type PerformanceResponse = {
  rows: PerformanceRow[];
  count: number;
  page: number;
  pageSize: number;
  summary: {
    sampleSize: number;
    slowRequestCount: number;
    averageDurationMs: number | null;
    p95DurationMs: number | null;
    errorCount: number;
    topRoutes: Array<{ route: string; count: number; maxDurationMs: number | null }>;
    warning?: string;
  };
  error?: string;
};

const pageSize = 20;

export default function AdminPerformancePage() {
  const [rows, setRows] = useState<PerformanceRow[]>([]);
  const [summary, setSummary] = useState<PerformanceResponse["summary"] | null>(null);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [route, setRoute] = useState("");
  const [operation, setOperation] = useState("");
  const [level, setLevel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (route.trim()) params.set("route", route.trim());
    if (operation.trim()) params.set("operation", operation.trim());
    if (level) params.set("level", level);
    return params.toString();
  }, [level, operation, page, route]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/system/performance?${queryString}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as PerformanceResponse;
      if (!response.ok) throw new Error(payload.error || "性能数据加载失败");
      setRows(payload.rows ?? []);
      setCount(payload.count ?? 0);
      setSummary(payload.summary);
    } catch (err) {
      setRows([]);
      setCount(0);
      setSummary(null);
      setError(err instanceof Error ? err.message : "性能数据加载失败");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetFilters() {
    setRoute("");
    setOperation("");
    setLevel("");
    setPage(1);
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4">
      <header className="mb-3 flex shrink-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-slate-950">性能检查</h1>
          <p className="mt-1 text-sm text-slate-500">查看慢请求摘要、接口频率和最近性能事件，不展示 SQL、密钥或用户敏感输入。</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCcw className="h-4 w-4" />
          刷新
        </button>
      </header>

      <div className="grid shrink-0 gap-3 md:grid-cols-4">
        <MetricCard title="慢请求数量" value={summary?.slowRequestCount ?? "—"} icon={<Activity className="h-4 w-4" />} />
        <MetricCard title="平均响应" value={formatMs(summary?.averageDurationMs)} icon={<BarChart3 className="h-4 w-4" />} />
        <MetricCard title="P95 响应" value={formatMs(summary?.p95DurationMs)} icon={<BarChart3 className="h-4 w-4" />} />
        <MetricCard title="错误事件" value={summary?.errorCount ?? "—"} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid shrink-0 gap-3 border-b border-slate-100 p-3 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_160px_88px]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={route}
              onChange={(event) => {
                setRoute(event.target.value);
                setPage(1);
              }}
              placeholder="筛选接口路径"
              className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-slate-400"
            />
          </label>
          <input
            value={operation}
            onChange={(event) => {
              setOperation(event.target.value);
              setPage(1);
            }}
            placeholder="筛选操作名称"
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
          />
          <select
            value={level}
            onChange={(event) => {
              setLevel(event.target.value);
              setPage(1);
            }}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
          >
            <option value="">全部等级</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
            <option value="critical">critical</option>
          </select>
          <button type="button" onClick={resetFilters} className="h-10 rounded-lg bg-slate-100 px-3 text-sm font-medium text-slate-700">
            重置
          </button>
        </div>

        {summary?.warning ? <div className="shrink-0 border-b border-amber-100 bg-amber-50 px-4 py-2 text-sm text-amber-700">{summary.warning}</div> : null}
        {error ? <div className="shrink-0 border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div> : null}

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-[980px] w-full table-fixed text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-[220px] px-4 py-3">操作</th>
                <th className="w-[260px] px-4 py-3">接口</th>
                <th className="w-[110px] px-4 py-3">耗时</th>
                <th className="w-[100px] px-4 py-3">次数</th>
                <th className="w-[110px] px-4 py-3">状态</th>
                <th className="w-[170px] px-4 py-3">最近出现</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 8 }).map((_, index) => (
                  <tr key={index}>
                    <td colSpan={6} className="px-4 py-3">
                      <div className="h-8 animate-pulse rounded bg-slate-100" />
                    </td>
                  </tr>
                ))
              ) : rows.length ? (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900"><span className="block truncate" title={row.operation}>{row.operation}</span></td>
                    <td className="px-4 py-3 text-slate-600"><span className="block truncate" title={row.route ?? "—"}>{row.route ?? "—"}</span></td>
                    <td className="px-4 py-3 tabular-nums text-slate-900">{formatMs(row.durationMs)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">{row.occurrences}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{row.status}</span></td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(row.lastSeenAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-sm text-slate-500">
                    暂无性能事件。只有超过阈值或已接入性能追踪的接口会显示在这里。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
          <span>共 {count} 条记录</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded border px-3 py-1 disabled:opacity-40">
              上一页
            </button>
            <span>
              第 {page} / {totalPages} 页
            </span>
            <button disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded border px-3 py-1 disabled:opacity-40">
              下一页
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricCard({ title, value, icon }: { title: string; value: string | number; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between text-slate-500">
        <span className="text-sm">{title}</span>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function formatMs(value: number | null | undefined) {
  return typeof value === "number" ? `${value} ms` : "—";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { hour12: false });
}
