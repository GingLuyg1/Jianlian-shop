"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Eye, RotateCcw, Search, X } from "lucide-react";

type SystemErrorEvent = {
  id: string;
  fingerprint: string;
  level: "debug" | "info" | "warn" | "error" | "critical";
  category: string;
  error_code: string | null;
  title: string;
  message: string;
  route: string | null;
  request_id: string | null;
  user_id: string | null;
  admin_id: string | null;
  order_id: string | null;
  payment_id: string | null;
  product_id: string | null;
  sku_id: string | null;
  occurrences: number;
  first_seen_at: string;
  last_seen_at: string;
  status: "open" | "investigating" | "resolved" | "ignored";
  resolution_note: string | null;
  metadata: unknown;
};

const levelLabels: Record<string, string> = {
  debug: "调试",
  info: "信息",
  warn: "警告",
  error: "错误",
  critical: "严重",
};

const statusLabels: Record<string, string> = {
  open: "待处理",
  investigating: "处理中",
  resolved: "已解决",
  ignored: "已忽略",
};

const categoryLabels: Record<string, string> = {
  products: "商品",
  sku: "SKU",
  orders: "订单",
  inventory: "库存",
  payments: "支付",
  recharges: "充值",
  balance: "余额",
  delivery: "发货",
  reconciliation: "对账",
  notifications: "通知",
  auth: "权限",
  system: "系统",
  performance: "性能",
};

const levelClass: Record<string, string> = {
  critical: "bg-red-50 text-red-700 ring-red-200",
  error: "bg-rose-50 text-rose-700 ring-rose-200",
  warn: "bg-amber-50 text-amber-700 ring-amber-200",
  info: "bg-blue-50 text-blue-700 ring-blue-200",
  debug: "bg-slate-50 text-slate-600 ring-slate-200",
};

const statusClass: Record<string, string> = {
  open: "bg-red-50 text-red-700 ring-red-200",
  investigating: "bg-amber-50 text-amber-700 ring-amber-200",
  resolved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  ignored: "bg-slate-50 text-slate-600 ring-slate-200",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

export default function AdminSystemErrorsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [events, setEvents] = useState<SystemErrorEvent[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<SystemErrorEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");

  const [level, setLevel] = useState(searchParams.get("level") ?? "");
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [requestId, setRequestId] = useState(searchParams.get("requestId") ?? "");
  const [orderId, setOrderId] = useState(searchParams.get("orderId") ?? "");
  const [paymentId, setPaymentId] = useState(searchParams.get("paymentId") ?? "");
  const [startAt, setStartAt] = useState(searchParams.get("startAt") ?? "");
  const [endAt, setEndAt] = useState(searchParams.get("endAt") ?? "");
  const [page, setPage] = useState(Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = 20;

  const debouncedRequestId = useDebouncedValue(requestId);
  const debouncedOrderId = useDebouncedValue(orderId);
  const debouncedPaymentId = useDebouncedValue(paymentId);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (level) params.set("level", level);
    if (category) params.set("category", category);
    if (status) params.set("status", status);
    if (debouncedRequestId.trim()) params.set("requestId", debouncedRequestId.trim());
    if (debouncedOrderId.trim()) params.set("orderId", debouncedOrderId.trim());
    if (debouncedPaymentId.trim()) params.set("paymentId", debouncedPaymentId.trim());
    if (startAt) params.set("startAt", startAt);
    if (endAt) params.set("endAt", endAt);
    return params.toString();
  }, [category, debouncedOrderId, debouncedPaymentId, debouncedRequestId, endAt, level, page, startAt, status]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/system-errors?${queryString}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | { events?: SystemErrorEvent[]; count?: number; error?: string }
        | null;
      if (!response.ok) throw new Error(payload?.error ?? "异常事件加载失败，请稍后重试。");
      setEvents(payload?.events ?? []);
      setCount(payload?.count ?? 0);
    } catch (loadError) {
      setEvents([]);
      setCount(0);
      setError(loadError instanceof Error ? loadError.message : "异常事件加载失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    router.replace(`${pathname}?${queryString}`, { scroll: false });
    void loadEvents();
  }, [loadEvents, pathname, queryString, router]);

  useEffect(() => {
    setPage(1);
  }, [category, debouncedOrderId, debouncedPaymentId, debouncedRequestId, endAt, level, startAt, status]);

  useEffect(() => {
    setResolutionNote(selected?.resolution_note ?? "");
  }, [selected]);

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const resetFilters = () => {
    setLevel("");
    setCategory("");
    setStatus("");
    setRequestId("");
    setOrderId("");
    setPaymentId("");
    setStartAt("");
    setEndAt("");
    setPage(1);
  };

  const updateStatus = async (nextStatus: SystemErrorEvent["status"]) => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/system-errors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, status: nextStatus, resolutionNote }),
      });
      const payload = (await response.json().catch(() => null)) as { event?: SystemErrorEvent; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "处理状态更新失败");
      if (payload?.event) {
        setSelected(payload.event);
        setEvents((current) => current.map((item) => (item.id === payload.event?.id ? payload.event : item)));
      }
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "处理状态更新失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 lg:px-5 lg:py-4">
      <div className="mb-3 flex shrink-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-950">异常中心</h1>
          <p className="mt-1 text-sm text-slate-500">聚合生产异常、慢请求和关键业务失败，支持处理状态记录。</p>
        </div>
        <button
          type="button"
          onClick={() => void loadEvents()}
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
              <h2 className="text-base font-semibold text-slate-950">异常事件</h2>
              <p className="text-xs text-slate-500">当前结果 {count} 条</p>
            </div>
          </div>
          <div className="grid gap-2 xl:grid-cols-[120px_150px_140px_minmax(160px,1fr)_160px_160px_160px_160px_76px]">
            <select value={level} onChange={(event) => setLevel(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary">
              <option value="">全部级别</option>
              {Object.entries(levelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary">
              <option value="">全部分类</option>
              {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary">
              <option value="">全部状态</option>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={requestId} onChange={(event) => setRequestId(event.target.value)} placeholder="request_id" className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-primary" />
            </label>
            <input value={orderId} onChange={(event) => setOrderId(event.target.value)} placeholder="订单 ID" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary" />
            <input value={paymentId} onChange={(event) => setPaymentId(event.target.value)} placeholder="支付 ID" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary" />
            <input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary" />
            <input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary" />
            <button type="button" onClick={resetFilters} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">重置</button>
          </div>
        </div>

        {error ? <div className="mx-3 mt-3 rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1260px] table-fixed text-sm">
            <colgroup>
              <col className="w-[90px]" />
              <col className="w-[110px]" />
              <col className="w-[260px]" />
              <col className="w-[130px]" />
              <col className="w-[90px]" />
              <col className="w-[150px]" />
              <col className="w-[150px]" />
              <col className="w-[150px]" />
              <col className="w-[110px]" />
              <col className="w-[90px]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500">
              <tr className="border-b border-slate-100">
                {["级别", "分类", "标题", "错误码", "次数", "首次时间", "最后时间", "关联业务", "状态", "操作"].map((heading) => (
                  <th key={heading} className="h-10 whitespace-nowrap px-3 text-left font-medium">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 8 }).map((_, rowIndex) => (
                  <tr key={rowIndex}>{Array.from({ length: 10 }).map((__, cellIndex) => <td key={cellIndex} className="h-12 px-3"><div className="h-3 rounded bg-slate-100" /></td>)}</tr>
                ))
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <div className="flex h-72 flex-col items-center justify-center text-center">
                      <AlertTriangle className="h-8 w-8 text-slate-300" />
                      <p className="mt-3 text-base font-medium text-slate-800">暂无异常事件</p>
                      <p className="mt-1 text-sm text-slate-500">生产异常被捕获后会在这里聚合展示。</p>
                    </div>
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={event.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2"><Badge className={levelClass[event.level]}>{levelLabels[event.level] ?? event.level}</Badge></td>
                    <td className="px-3 py-2 whitespace-nowrap">{categoryLabels[event.category] ?? event.category}</td>
                    <td className="px-3 py-2"><div className="truncate font-medium text-slate-800" title={event.title}>{event.title}</div><div className="truncate text-xs text-slate-500" title={event.message}>{event.message}</div></td>
                    <td className="truncate px-3 py-2 text-xs text-slate-500" title={event.error_code ?? ""}>{event.error_code ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{event.occurrences}</td>
                    <td className="px-3 py-2 text-xs tabular-nums text-slate-500 whitespace-nowrap">{formatDate(event.first_seen_at)}</td>
                    <td className="px-3 py-2 text-xs tabular-nums text-slate-500 whitespace-nowrap">{formatDate(event.last_seen_at)}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{businessLinks(event)}</td>
                    <td className="px-3 py-2"><Badge className={statusClass[event.status]}>{statusLabels[event.status] ?? event.status}</Badge></td>
                    <td className="px-3 py-2"><button type="button" onClick={() => setSelected(event)} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-slate-700 hover:bg-slate-50"><Eye className="h-3.5 w-3.5" />查看</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex h-12 shrink-0 items-center justify-between border-t border-slate-100 px-3 text-sm text-slate-500">
          <span>共 {count} 条，第 {page} / {totalPages} 页</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="h-8 rounded-md border border-slate-200 px-3 disabled:cursor-not-allowed disabled:opacity-50">上一页</button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="h-8 rounded-md border border-slate-200 px-3 disabled:cursor-not-allowed disabled:opacity-50">下一页</button>
          </div>
        </div>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" onClick={() => setSelected(null)}>
          <aside className="h-full w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">异常详情</h2>
                <p className="mt-1 text-sm text-slate-500">安全脱敏后的异常信息和处理状态。</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <Detail label="标题" value={selected.title} />
              <Detail label="消息" value={selected.message} />
              <Detail label="错误码" value={selected.error_code ?? "—"} />
              <Detail label="路由" value={selected.route ?? "—"} />
              <Detail label="Request ID" value={selected.request_id ?? "—"} />
              <Detail label="Fingerprint" value={selected.fingerprint} />
              <Detail label="出现次数" value={String(selected.occurrences)} />
              <Detail label="首次出现" value={formatDate(selected.first_seen_at)} />
              <Detail label="最后出现" value={formatDate(selected.last_seen_at)} />
              <div className="rounded-lg border border-slate-100 p-3">
                <div className="mb-2 text-xs text-slate-500">处理备注</div>
                <textarea value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} rows={4} className="w-full resize-none rounded-lg border border-slate-200 p-2 text-sm outline-none focus:border-primary" placeholder="填写处理结论或排查备注" />
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["investigating", "resolved", "ignored", "open"] as const).map((next) => (
                    <button key={next} type="button" disabled={saving} onClick={() => void updateStatus(next)} className="h-9 rounded-md border border-slate-200 px-3 text-sm hover:bg-slate-50 disabled:opacity-60">
                      标记为{statusLabels[next]}
                    </button>
                  ))}
                </div>
              </div>
              <JsonSection title="扩展信息" value={selected.metadata} />
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}

function Badge({ children, className }: { children: ReactNode; className: string }) {
  return <span className={`inline-flex h-6 min-w-[58px] items-center justify-center rounded-full px-2 text-xs font-medium ring-1 ${className}`}>{children}</span>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-100 p-3"><div className="mb-1 text-xs text-slate-500">{label}</div><div className="break-words text-slate-800">{value}</div></div>;
}

function JsonSection({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <div className="mb-2 text-xs text-slate-500">{title}</div>
      <pre className="max-h-56 overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">{JSON.stringify(value ?? {}, null, 2)}</pre>
    </div>
  );
}

function businessLinks(event: SystemErrorEvent) {
  if (event.order_id) return <Link className="text-primary hover:underline" href={`/admin/orders?orderId=${event.order_id}`}>订单</Link>;
  if (event.payment_id) return <Link className="text-primary hover:underline" href={`/admin/payments?paymentId=${event.payment_id}`}>支付</Link>;
  if (event.product_id) return <Link className="text-primary hover:underline" href={`/admin/products?productId=${event.product_id}`}>商品</Link>;
  if (event.sku_id) return <span>SKU</span>;
  return <span>—</span>;
}
