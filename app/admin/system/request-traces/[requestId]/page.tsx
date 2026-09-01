"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Copy, RefreshCw } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <AdminPageShell title="Request ID 追踪" description={requestId} actions={<><Button variant="outline" onClick={copyId}><Copy className="mr-2 h-4 w-4" />复制 ID</Button><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />{loading ? "刷新中..." : "刷新"}</Button></>}>
      <div className="min-h-0 flex-1 overflow-auto">
        <Link href="/admin/system/request-traces" className="mb-3 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />返回请求追踪</Link>
        <Card>
          <CardHeader><CardTitle>链路事件</CardTitle></CardHeader>
          <CardContent>
            {error ? <AdminErrorState description={error} onRetry={() => void load()} /> : loading ? <AdminTableSkeleton rows={6} /> : payload?.events.length ? (
              <div className="space-y-3">
                {payload.events.map((event) => <article key={event.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm text-slate-500">{formatDate(event.occurredAt)} · {event.source}</div><div className="mt-1 text-base font-semibold text-slate-950">{event.title}</div></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{event.status || "—"}</span></div><div className="mt-2 text-sm text-slate-700">{event.summary}</div><dl className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-4"><div>业务类型：{event.businessType || "—"}</div><div>业务 ID：{event.businessId || "—"}</div><div>错误代码：{event.errorCode || "—"}</div><div>路由：{event.route || "—"}</div></dl><div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500">{compactJson(event.metadata)}</div></article>)}
              </div>
            ) : <AdminEmptyState title="暂无链路记录" description="该 Request ID 在现有异常、审计和业务事件数据源中没有记录。" />}
          </CardContent>
        </Card>
        {payload && Object.keys(payload.moduleErrors).length ? <Card className="mt-4"><CardHeader><CardTitle>数据源读取状态</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-amber-700">{Object.entries(payload.moduleErrors).map(([module, message]) => <div key={module}>{module}: {message}</div>)}</CardContent></Card> : null}
      </div>
    </AdminPageShell>
  );
}

function formatDate(value: string | null) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false }); }
function compactJson(value: unknown) { if (!value) return "—"; try { const text = JSON.stringify(value); return text.length > 220 ? `${text.slice(0, 220)}...` : text; } catch { return "—"; } }
