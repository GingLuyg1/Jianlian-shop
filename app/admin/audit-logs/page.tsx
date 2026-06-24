"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Copy, Eye, RotateCcw, Search, X } from "lucide-react";

type AuditLog = {
  id: string;
  admin_user_id: string | null;
  admin_email: string | null;
  action: string;
  module: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  request_id: string;
  ip_address: string | null;
  user_agent: string | null;
  result: "success" | "failed" | "denied";
  error_code: string | null;
  error_message: string | null;
  before_summary: unknown;
  after_summary: unknown;
  metadata: unknown;
  created_at: string;
};

const MODULE_LABELS: Record<string, string> = {
  payments: "支付",
  recharges: "充值",
  orders: "订单",
  users: "用户",
  products: "商品",
  categories: "分类",
  inventory: "库存",
  delivery: "发货",
  settings: "设置",
  system: "系统",
};

const RESULT_LABELS: Record<string, string> = {
  success: "成功",
  failed: "失败",
  denied: "拒绝",
};

const RESULT_CLASS_NAMES: Record<string, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  failed: "bg-rose-50 text-rose-700 ring-rose-200",
  denied: "bg-amber-50 text-amber-700 ring-amber-200",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function safeText(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  return String(value);
}

function JsonBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-slate-400">—</span>;
  return (
    <pre className="max-h-56 overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);

  return debounced;
}

export default function AdminAuditLogsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [copied, setCopied] = useState("");

  const [adminEmail, setAdminEmail] = useState(searchParams.get("adminEmail") ?? "");
  const [action, setAction] = useState(searchParams.get("action") ?? "");
  const [targetId, setTargetId] = useState(searchParams.get("targetId") ?? "");
  const [requestId, setRequestId] = useState(searchParams.get("requestId") ?? "");
  const [moduleFilter, setModuleFilter] = useState(searchParams.get("module") ?? "");
  const [resultFilter, setResultFilter] = useState(searchParams.get("result") ?? "");
  const [startAt, setStartAt] = useState(searchParams.get("startAt") ?? "");
  const [endAt, setEndAt] = useState(searchParams.get("endAt") ?? "");
  const [page, setPage] = useState(Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = 20;

  const debouncedAdminEmail = useDebouncedValue(adminEmail);
  const debouncedAction = useDebouncedValue(action);
  const debouncedTargetId = useDebouncedValue(targetId);
  const debouncedRequestId = useDebouncedValue(requestId);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (debouncedAdminEmail.trim()) params.set("adminEmail", debouncedAdminEmail.trim());
    if (moduleFilter) params.set("module", moduleFilter);
    if (debouncedAction.trim()) params.set("action", debouncedAction.trim());
    if (resultFilter) params.set("result", resultFilter);
    if (debouncedTargetId.trim()) params.set("targetId", debouncedTargetId.trim());
    if (debouncedRequestId.trim()) params.set("requestId", debouncedRequestId.trim());
    if (startAt) params.set("startAt", startAt);
    if (endAt) params.set("endAt", endAt);
    return params.toString();
  }, [
    debouncedAction,
    debouncedAdminEmail,
    debouncedRequestId,
    debouncedTargetId,
    endAt,
    moduleFilter,
    page,
    pageSize,
    resultFilter,
    startAt,
  ]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/audit-logs?${queryString}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | { logs?: AuditLog[]; count?: number; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "审计日志加载失败，请稍后重试。");
      }

      setLogs(payload?.logs ?? []);
      setCount(payload?.count ?? 0);
    } catch (loadError) {
      setLogs([]);
      setCount(0);
      setError(loadError instanceof Error ? loadError.message : "审计日志加载失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    router.replace(`${pathname}?${queryString}`, { scroll: false });
    loadLogs();
  }, [loadLogs, pathname, queryString, router]);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedAction,
    debouncedAdminEmail,
    debouncedRequestId,
    debouncedTargetId,
    endAt,
    moduleFilter,
    resultFilter,
    startAt,
  ]);

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const resetFilters = () => {
    setAdminEmail("");
    setAction("");
    setTargetId("");
    setRequestId("");
    setModuleFilter("");
    setResultFilter("");
    setStartAt("");
    setEndAt("");
    setPage(1);
  };

  const copyRequestId = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied("请求编号已复制");
      window.setTimeout(() => setCopied(""), 1600);
    } catch {
      setCopied("复制失败，请手动复制");
      window.setTimeout(() => setCopied(""), 1600);
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 lg:px-5 lg:py-4">
      <div className="mb-3 flex shrink-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-950">操作日志</h1>
          <p className="mt-1 text-sm text-slate-500">
            查询后台敏感操作记录。日志只读，不提供前端修改入口。
          </p>
        </div>
        <button
          type="button"
          onClick={loadLogs}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <RotateCcw className="h-4 w-4" />
          刷新
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="shrink-0 border-b border-slate-100 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-950">审计记录</h2>
              <p className="text-xs text-slate-500">当前结果 {count} 条</p>
            </div>
            {copied ? <span className="text-xs text-primary">{copied}</span> : null}
          </div>

          <div className="grid gap-2 xl:grid-cols-[minmax(160px,1fr)_150px_150px_130px_150px_150px_150px_150px_76px]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
                placeholder="管理员邮箱"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </label>
            <select
              value={moduleFilter}
              onChange={(event) => setModuleFilter(event.target.value)}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary"
            >
              <option value="">全部模块</option>
              {Object.entries(MODULE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              value={action}
              onChange={(event) => setAction(event.target.value)}
              placeholder="操作类型"
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary"
            />
            <select
              value={resultFilter}
              onChange={(event) => setResultFilter(event.target.value)}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary"
            >
              <option value="">全部结果</option>
              {Object.entries(RESULT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              placeholder="目标 ID"
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary"
            />
            <input
              value={requestId}
              onChange={(event) => setRequestId(event.target.value)}
              placeholder="请求编号"
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary"
            />
            <input
              type="datetime-local"
              value={startAt}
              onChange={(event) => setStartAt(event.target.value)}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary"
            />
            <input
              type="datetime-local"
              value={endAt}
              onChange={(event) => setEndAt(event.target.value)}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={resetFilters}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"
            >
              重置
            </button>
          </div>
        </div>

        {error ? (
          <div className="mx-3 mt-3 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1180px] table-fixed text-sm">
            <colgroup>
              <col className="w-[150px]" />
              <col className="w-[190px]" />
              <col className="w-[110px]" />
              <col className="w-[150px]" />
              <col className="w-[190px]" />
              <col className="w-[92px]" />
              <col className="w-[140px]" />
              <col className="w-[210px]" />
              <col className="w-[92px]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500">
              <tr className="border-b border-slate-100">
                {["时间", "管理员", "模块", "操作", "目标", "结果", "IP", "请求编号", "操作"].map(
                  (heading) => (
                    <th key={heading} className="h-10 px-3 text-left font-medium whitespace-nowrap">
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 8 }).map((_, index) => (
                  <tr key={index}>
                    {Array.from({ length: 9 }).map((__, cellIndex) => (
                      <td key={cellIndex} className="h-12 px-3">
                        <div className="h-3 rounded bg-slate-100" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className="flex h-72 flex-col items-center justify-center text-center">
                      <p className="text-base font-medium text-slate-800">暂无审计记录</p>
                      <p className="mt-1 text-sm text-slate-500">
                        后台敏感操作发生后会显示在这里。
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-xs tabular-nums text-slate-500 whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="truncate px-3 py-2 text-slate-700" title={safeText(log.admin_email)}>
                      {safeText(log.admin_email)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {MODULE_LABELS[log.module] ?? log.module}
                    </td>
                    <td className="truncate px-3 py-2" title={log.action}>
                      {log.action}
                    </td>
                    <td className="px-3 py-2">
                      <div className="truncate text-slate-800" title={safeText(log.target_label)}>
                        {safeText(log.target_label)}
                      </div>
                      <div className="truncate text-xs text-slate-400" title={safeText(log.target_id)}>
                        {safeText(log.target_id)}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`inline-flex h-6 min-w-[56px] items-center justify-center rounded-full px-2 text-xs font-medium ring-1 ${
                          RESULT_CLASS_NAMES[log.result] ?? RESULT_CLASS_NAMES.failed
                        }`}
                      >
                        {RESULT_LABELS[log.result] ?? log.result}
                      </span>
                    </td>
                    <td className="truncate px-3 py-2 text-xs text-slate-500" title={safeText(log.ip_address)}>
                      {safeText(log.ip_address)}
                    </td>
                    <td className="truncate px-3 py-2 text-xs text-slate-500" title={log.request_id}>
                      {log.request_id}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setSelectedLog(log)}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        查看
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex h-12 shrink-0 items-center justify-between border-t border-slate-100 px-3 text-sm text-slate-500">
          <span>
            共 {count} 条，第 {page} / {totalPages} 页
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="h-8 rounded-md border border-slate-200 px-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              上一页
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              className="h-8 rounded-md border border-slate-200 px-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      {selectedLog ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" onClick={() => setSelectedLog(null)}>
          <aside
            className="h-full w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">审计详情</h2>
                <p className="mt-1 text-sm text-slate-500">查看本次后台操作的只读记录。</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <DetailRow label="管理员" value={safeText(selectedLog.admin_email)} />
              <DetailRow label="模块" value={MODULE_LABELS[selectedLog.module] ?? selectedLog.module} />
              <DetailRow label="操作" value={selectedLog.action} />
              <DetailRow label="目标对象" value={`${safeText(selectedLog.target_label)} / ${safeText(selectedLog.target_id)}`} />
              <DetailRow label="执行结果" value={RESULT_LABELS[selectedLog.result] ?? selectedLog.result} />
              <div className="rounded-lg border border-slate-100 p-3">
                <div className="mb-1 text-xs text-slate-500">请求编号</div>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate text-xs text-slate-700">
                    {selectedLog.request_id}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyRequestId(selectedLog.request_id)}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    复制
                  </button>
                </div>
              </div>
              <DetailRow label="IP 地址" value={safeText(selectedLog.ip_address)} />
              <DetailRow label="User-Agent" value={safeText(selectedLog.user_agent)} />
              <DetailRow label="错误代码" value={safeText(selectedLog.error_code)} />
              <DetailRow label="错误信息" value={safeText(selectedLog.error_message)} />
              <DetailRow label="创建时间" value={formatDate(selectedLog.created_at)} />

              <JsonSection title="修改前摘要" value={selectedLog.before_summary} />
              <JsonSection title="修改后摘要" value={selectedLog.after_summary} />
              <JsonSection title="扩展信息" value={selectedLog.metadata} />
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <div className="mb-1 text-xs text-slate-500">{label}</div>
      <div className="break-words text-slate-800">{value}</div>
    </div>
  );
}

function JsonSection({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <div className="mb-2 text-xs text-slate-500">{title}</div>
      <JsonBlock value={value} />
    </div>
  );
}
