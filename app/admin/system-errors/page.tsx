"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Eye, RefreshCw } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { AdminDetailDrawer } from "@/components/admin/v2/AdminDetail";
import { AdminInfoGrid, AdminInfoItem } from "@/components/admin/v2/AdminInfoGrid";
import { AdminFilterBar, AdminListPagination, AdminListSurface, AdminTableViewport, adminListRowClass, adminListTableHeadClass } from "@/components/admin/v2/AdminList";
import AdminSection from "@/components/admin/v2/AdminSection";
import AdminStatusBadge, { type AdminStatusTone } from "@/components/admin/v2/AdminStatusBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EventStatus = "open" | "investigating" | "resolved" | "ignored";
type EventRow = { id: string; fingerprint: string; level: string; category: string; error_code: string | null; title: string; message: string; route: string | null; request_id: string | null; order_id: string | null; payment_id: string | null; product_id: string | null; sku_id: string | null; occurrences: number; first_seen_at: string; last_seen_at: string; status: EventStatus; resolution_note: string | null };
type ApiError = { message?: string; request_id?: string };

const levels: Record<string, string> = { debug: "调试", info: "信息", warn: "警告", error: "错误", critical: "严重" };
const statuses: Record<string, string> = { open: "待处理", investigating: "处理中", resolved: "已解决", ignored: "已忽略" };
const categories: Record<string, string> = { products: "商品", sku: "SKU", orders: "订单", inventory: "库存", payments: "支付", recharges: "充值", balance: "余额", refund: "退款", delivery: "交付", reconciliation: "对账", notifications: "通知", email: "邮件", auth: "认证", database: "数据库", security: "安全", deployment: "部署", system: "系统", performance: "性能" };

export default function AdminSystemErrorsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const initial = useSearchParams();
  const [rows, setRows] = useState<EventRow[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<EventRow | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [level, setLevel] = useState(initial.get("level") ?? "");
  const [category, setCategory] = useState(initial.get("category") ?? "");
  const [status, setStatus] = useState(initial.get("status") ?? "");
  const [requestId, setRequestId] = useState(initial.get("requestId") ?? "");
  const [businessId, setBusinessId] = useState(initial.get("orderId") ?? "");
  const [startAt, setStartAt] = useState(initial.get("startAt") ?? "");
  const [endAt, setEndAt] = useState(initial.get("endAt") ?? "");
  const [page, setPage] = useState(Number(initial.get("page") ?? 1) || 1);
  const pageSize = 20;

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (level) params.set("level", level);
    if (category) params.set("category", category);
    if (status) params.set("status", status);
    if (requestId.trim()) params.set("requestId", requestId.trim());
    if (businessId.trim()) params.set("orderId", businessId.trim());
    if (startAt) params.set("startAt", startAt);
    if (endAt) params.set("endAt", endAt);
    return params.toString();
  }, [businessId, category, endAt, level, page, requestId, startAt, status]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/system-errors?${query}`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as { events?: EventRow[]; count?: number; error?: ApiError } | null;
      if (!response.ok) throw new Error(errorMessage(body?.error, response));
      setRows(body?.events ?? []);
      setCount(body?.count ?? 0);
    } catch (caught) {
      setRows([]);
      setCount(0);
      setError(caught instanceof Error ? caught.message : "异常事件加载失败，请稍后重试。");
    } finally { setLoading(false); }
  }, [query]);

  useEffect(() => { router.replace(`${pathname}?${query}`, { scroll: false }); void load(); }, [load, pathname, query, router]);
  useEffect(() => { setNote(selected?.resolution_note ?? ""); }, [selected]);

  async function updateStatus(next: EventStatus) {
    if (!selected || saving) return;
    if ((next === "resolved" || next === "ignored") && !note.trim()) { setError("标记已解决或已忽略时必须填写处理说明。"); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/system-errors", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected.id, status: next, resolutionNote: note }) });
      const body = await response.json().catch(() => null) as { event?: EventRow; error?: ApiError } | null;
      if (!response.ok) throw new Error(errorMessage(body?.error, response));
      if (body?.event) { setSelected(body.event); setRows((current) => current.map((row) => row.id === body.event?.id ? body.event : row)); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "状态更新失败，请稍后重试。"); }
    finally { setSaving(false); }
  }

  const pages = Math.max(1, Math.ceil(count / pageSize));
  const reset = () => { setLevel(""); setCategory(""); setStatus(""); setRequestId(""); setBusinessId(""); setStartAt(""); setEndAt(""); setPage(1); };

  return (
    <AdminPageShell variant="v2" title="异常中心" description="查看经过脱敏聚合的系统异常，并使用现有接口记录调查、解决或忽略状态。" actions={<Button className="h-11 sm:h-9" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />{loading ? "刷新中..." : "刷新"}</Button>}>
      <AdminListSurface>
        <AdminFilterBar className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
          <FilterSelect value={level} onChange={(value) => { setLevel(value); setPage(1); }} label="全部级别" options={levels} />
          <FilterSelect value={category} onChange={(value) => { setCategory(value); setPage(1); }} label="全部分类" options={categories} />
          <FilterSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} label="全部状态" options={statuses} />
          <input aria-label="Request ID" value={requestId} onChange={(event) => { setRequestId(event.target.value); setPage(1); }} placeholder="Request ID" className={controlClass} />
          <input aria-label="订单 ID" value={businessId} onChange={(event) => { setBusinessId(event.target.value); setPage(1); }} placeholder="订单 ID" className={controlClass} />
          <input aria-label="开始时间" type="datetime-local" value={startAt} onChange={(event) => { setStartAt(event.target.value); setPage(1); }} className={controlClass} title="开始时间" />
          <input aria-label="结束时间" type="datetime-local" value={endAt} onChange={(event) => { setEndAt(event.target.value); setPage(1); }} className={controlClass} title="结束时间" />
          <Button className="h-11 sm:h-9" type="button" variant="outline" onClick={reset}>重置</Button>
        </AdminFilterBar>
        <AdminTableViewport>
          {error ? <AdminErrorState description={error} onRetry={() => void load()} /> : loading ? <AdminTableSkeleton rows={8} /> : rows.length === 0 ? <AdminEmptyState title="暂无异常记录" description={queryHasFilters(query) ? "没有符合当前筛选条件的异常。" : "系统尚未记录异常事件。"} /> : <ErrorTable rows={rows} onSelect={setSelected} />}
        </AdminTableViewport>
        <AdminListPagination summary={`共 ${count} 条，第 ${page}/${pages} 页`} page={page} totalPages={pages} loading={loading} onPrevious={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(pages, value + 1))} />
      </AdminListSurface>
      {selected ? <ErrorDetail event={selected} note={note} saving={saving} onNote={setNote} onClose={() => setSelected(null)} onStatus={(next) => void updateStatus(next)} /> : null}
    </AdminPageShell>
  );
}

function ErrorTable({ rows, onSelect }: { rows: EventRow[]; onSelect: (row: EventRow) => void }) {
  return <table className="w-full min-w-[1100px] text-sm"><thead className={adminListTableHeadClass}><tr>{["级别", "分类", "异常", "Request ID", "次数", "最后出现", "关联业务", "状态", "操作"].map((heading) => <th key={heading} scope="col" className="px-3 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y divide-[var(--admin-v2-border)]">{rows.map((row) => <tr key={row.id} className={adminListRowClass}><td className="px-3 py-2 font-medium">{levels[row.level] ?? row.level}</td><td className="px-3 py-2">{categories[row.category] ?? row.category}</td><td className="max-w-[300px] px-3 py-2"><div className="truncate font-medium" title={row.title}>{row.title}</div><div className="truncate text-xs text-[var(--admin-v2-text-muted)]" title={row.message}>{row.message}</div></td><td className="max-w-[180px] truncate px-3 py-2 font-mono text-xs">{row.request_id ?? "—"}</td><td className="px-3 py-2 tabular-nums">{row.occurrences}</td><td className="whitespace-nowrap px-3 py-2 text-xs">{formatDate(row.last_seen_at)}</td><td className="px-3 py-2">{businessLink(row)}</td><td className="px-3 py-2"><AdminStatusBadge tone={statusTone(row.status)}>{statuses[row.status] ?? row.status}</AdminStatusBadge></td><td className="px-3 py-2"><Button className="h-11 sm:h-9" size="sm" variant="outline" onClick={() => onSelect(row)}><Eye className="mr-1 h-3.5 w-3.5" />查看</Button></td></tr>)}</tbody></table>;
}

function ErrorDetail({ event, note, saving, onNote, onClose, onStatus }: { event: EventRow; note: string; saving: boolean; onNote: (value: string) => void; onClose: () => void; onStatus: (status: EventStatus) => void }) {
  return <AdminDetailDrawer title={event.title} eyebrow="异常详情" description="只展示接口返回的安全摘要，不提供虚假重试或修复操作。" status={<AdminStatusBadge tone={statusTone(event.status)}>{statuses[event.status]}</AdminStatusBadge>} onClose={onClose} className="max-w-xl"><div className="space-y-4"><AdminSection title="异常事实"><AdminInfoGrid><AdminInfoItem label="安全摘要" value={event.message} /><AdminInfoItem label="错误代码" value={event.error_code ?? "—"} mono /><AdminInfoItem label="路由" value={event.route ?? "—"} mono /><AdminInfoItem label="Request ID" value={event.request_id ?? "—"} mono /><AdminInfoItem label="首次出现" value={formatDate(event.first_seen_at)} /><AdminInfoItem label="最后出现" value={formatDate(event.last_seen_at)} /></AdminInfoGrid></AdminSection><AdminSection title="处理记录" description="解决或忽略时必须填写说明"><div className="space-y-3 px-4 pb-4 sm:px-5 sm:pb-5"><textarea aria-label="处理说明" value={note} onChange={(e) => onNote(e.target.value)} rows={4} placeholder="处理说明（解决或忽略时必填）" className="w-full rounded-[var(--admin-v2-control-radius)] border border-[var(--admin-v2-border)] p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-v2-primary)]" /><div className="flex flex-wrap gap-2">{(["investigating", "resolved", "ignored", "open"] as const).map((value) => <Button className="h-11 sm:h-9" key={value} variant="outline" disabled={saving} onClick={() => onStatus(value)}>标记为{statuses[value]}</Button>)}</div></div></AdminSection></div></AdminDetailDrawer>;
}

const controlClass = "h-11 min-w-0 rounded-[var(--admin-v2-control-radius)] border border-[var(--admin-v2-border)] bg-[var(--admin-v2-surface)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-v2-primary)] sm:h-9";
function FilterSelect({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: Record<string, string> }) { return <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className={controlClass}><option value="">{label}</option>{Object.entries(options).map(([option, text]) => <option key={option} value={option}>{text}</option>)}</select>; }
function errorMessage(error: ApiError | undefined, response: Response) { const message = error?.message || "请求失败，请稍后重试。"; const id = error?.request_id || response.headers.get("X-Request-ID"); return id ? `${message}（参考编号：${id.slice(0, 12)}）` : message; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false }); }
function businessLink(row: EventRow) { if (row.order_id) return <Link className="text-[var(--admin-v2-primary)]" href={`/admin/orders?orderId=${row.order_id}`}>订单</Link>; if (row.payment_id) return <Link className="text-[var(--admin-v2-primary)]" href={`/admin/payments?paymentId=${row.payment_id}`}>支付</Link>; if (row.product_id) return <Link className="text-[var(--admin-v2-primary)]" href={`/admin/products?productId=${row.product_id}`}>商品</Link>; return "—"; }
function queryHasFilters(query: string) { const params = new URLSearchParams(query); return ["level", "category", "status", "requestId", "orderId", "startAt", "endAt"].some((key) => params.has(key)); }
function statusTone(status: EventStatus): AdminStatusTone { return status === "resolved" ? "success" : status === "ignored" ? "neutral" : status === "investigating" ? "info" : "warning"; }
