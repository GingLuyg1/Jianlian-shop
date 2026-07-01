"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Copy, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type TraceEvent = {
  id: string;
  source: string;
  title: string;
  summary: string;
  status: string | null;
  businessType: string | null;
  businessId: string | null;
  route: string | null;
  errorCode: string | null;
  occurredAt: string | null;
  metadata: unknown;
};

type TracePayload = {
  requestId: string;
  events: TraceEvent[];
  moduleErrors: Record<string, string>;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function compactJson(value: unknown) {
  if (!value) return "—";
  try {
    const text = JSON.stringify(value);
    return text.length > 220 ? `${text.slice(0, 220)}...` : text;
  } catch {
    return "—";
  }
}

export default function AdminRequestTracePage() {
  const params = useParams<{ requestId: string }>();
  const requestId = useMemo(() => decodeURIComponent(params.requestId ?? ""), [params.requestId]);
  const [payload, setPayload] = useState<TracePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/system/request-traces/${encodeURIComponent(requestId)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "请求链路加载失败");
      setPayload(body as TracePayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求链路加载失败");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [requestId]);

  async function copyId() {
    await navigator.clipboard.writeText(requestId).catch(() => undefined);
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/system-errors" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> 返回异常中心
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">Request ID 追踪</h1>
          <p className="mt-1 font-mono text-sm text-slate-500">{requestId}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={copyId}><Copy className="mr-2 h-4 w-4" />复制 ID</Button>
          <Button onClick={load} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />重新加载</Button>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>链路事件</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-16 text-center text-slate-500">加载中...</div>
          ) : payload && payload.events.length ? (
            <div className="max-h-[calc(100vh-260px)] overflow-auto pr-2">
              <div className="space-y-3">
                {payload.events.map((event) => (
                  <div key={event.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm text-slate-500">{formatDate(event.occurredAt)} · {event.source}</div>
                        <div className="mt-1 text-base font-semibold text-slate-950">{event.title}</div>
                      </div>
                      <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{event.status || "—"}</div>
                    </div>
                    <div className="mt-2 text-sm text-slate-700">{event.summary}</div>
                    <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-4">
                      <div>业务类型：{event.businessType || "—"}</div>
                      <div>业务 ID：{event.businessId || "—"}</div>
                      <div>错误代码：{event.errorCode || "—"}</div>
                      <div>路由：{event.route || "—"}</div>
                    </div>
                    <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500">{compactJson(event.metadata)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-16 text-center text-slate-500">
              <div className="font-semibold text-slate-900">暂无链路记录</div>
              <div className="mt-1">可能是日志表尚未执行 migration，或该请求未写入追踪事件。</div>
            </div>
          )}
        </CardContent>
      </Card>

      {payload && Object.keys(payload.moduleErrors).length ? (
        <Card>
          <CardHeader><CardTitle>模块读取状态</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-amber-700">
            {Object.entries(payload.moduleErrors).map(([module, message]) => <div key={module}>{module}: {message}</div>)}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
