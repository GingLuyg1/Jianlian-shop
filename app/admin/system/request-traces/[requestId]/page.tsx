"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Copy, RefreshCw } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { AdminDetailBackLink, AdminTimeline } from "@/components/admin/v2/AdminDetail";
import { AdminInfoGrid, AdminInfoItem } from "@/components/admin/v2/AdminInfoGrid";
import AdminReadOnlyBadge from "@/components/admin/v2/AdminReadOnlyBadge";
import AdminSection from "@/components/admin/v2/AdminSection";
import AdminStatusBadge, { type AdminStatusTone } from "@/components/admin/v2/AdminStatusBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TraceEvent = { id: string; source: string; title: string; summary: string; status: string | null; businessType: string | null; businessId: string | null; route: string | null; errorCode: string | null; occurredAt: string | null; metadata: unknown };
type TracePayload = { requestId: string; events: TraceEvent[]; moduleErrors: Record<string, string> };

export default function AdminRequestTracePage() {
  const params = useParams<{ requestId: string }>();
  const requestId = useMemo(() => decodeURIComponent(params.requestId ?? ""), [params.requestId]);
  const [payload, setPayload] = useState<TracePayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin/system/request-traces/${encodeURIComponent(requestId)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "请求链路加载失败");
      setPayload(body as TracePayload);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "请求链路加载失败"); setPayload(null); }
    finally { setLoading(false); }
  }, [requestId]);

  useEffect(() => { void load(); }, [load]);
  const copyId = async () => { await navigator.clipboard.writeText(requestId).catch(() => undefined); };

  return (
    <AdminPageShell title="Request ID 追踪" description={requestId} actions={<><AdminReadOnlyBadge /><Button variant="outline" onClick={copyId}><Copy className="mr-2 h-4 w-4" />复制 ID</Button><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />{loading ? "刷新中..." : "刷新"}</Button></>}>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mb-3"><AdminDetailBackLink href="/admin/system/request-traces">返回请求追踪</AdminDetailBackLink></div>
        {error ? <AdminErrorState description={error} onRetry={() => void load()} /> : loading ? <AdminTableSkeleton rows={6} /> : payload ? <div className="space-y-4 pb-4">
          <AdminSection title="请求摘要" description="跨异常、审计与业务事件的只读链路"><AdminInfoGrid columns={3}><AdminInfoItem label="Request ID" value={payload.requestId} mono /><AdminInfoItem label="事件数量" value={String(payload.events.length)} className="tabular-nums" /><AdminInfoItem label="数据源告警" value={String(Object.keys(payload.moduleErrors).length)} className="tabular-nums" /></AdminInfoGrid></AdminSection>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <AdminSection title="链路事件" description="按现有数据源返回顺序展示">{payload.events.length ? <AdminTimeline items={payload.events.map((event) => ({ id: event.id, title: event.title, time: `${formatDate(event.occurredAt)} · ${event.source}`, actor: <span className="flex flex-wrap items-center gap-2"><AdminStatusBadge tone={statusTone(event.status)}>{event.status || "未知状态"}</AdminStatusBadge><span>{event.businessType || "未关联业务"}{event.businessId ? ` · ${event.businessId}` : ""}</span></span>, message: <span className="block space-y-1"><span className="block">{event.summary}</span><span className="block font-mono">{event.route || "—"} · {event.errorCode || "无错误代码"}</span><span className="block font-mono">{compactJson(event.metadata)}</span></span> }))} /> : <AdminEmptyState title="暂无链路记录" description="该 Request ID 在现有异常、审计和业务事件数据源中没有记录。" />}</AdminSection>
            <aside><AdminSection title="数据源读取状态" description="部分模块不可用时仍保留其余链路结果">{Object.keys(payload.moduleErrors).length ? <div className="space-y-2 px-4 pb-4 text-sm text-[var(--admin-v2-warning-foreground)] sm:px-5 sm:pb-5">{Object.entries(payload.moduleErrors).map(([module, message]) => <div key={module} className="break-words rounded-[var(--admin-v2-control-radius)] bg-[var(--admin-v2-warning-background)] p-3"><span className="font-medium">{module}</span><span className="mt-1 block text-xs">{message}</span></div>)}</div> : <AdminEmptyState title="全部数据源读取正常" className="min-h-[140px]" />}</AdminSection></aside>
          </div>
        </div> : <AdminEmptyState title="暂无链路记录" />}
      </div>
    </AdminPageShell>
  );
}

function formatDate(value: string | null) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false }); }
function compactJson(value: unknown) { if (!value) return "—"; try { const text = JSON.stringify(value); return text.length > 220 ? `${text.slice(0, 220)}...` : text; } catch { return "—"; } }
function statusTone(status: string | null): AdminStatusTone { if (!status) return "neutral"; if (["success", "completed", "resolved"].includes(status)) return "success"; if (["failed", "error"].includes(status)) return "danger"; if (["pending", "processing", "warning"].includes(status)) return "warning"; return "info"; }
