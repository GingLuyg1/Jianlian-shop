"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, RefreshCcw, ScrollText, ShieldAlert } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RiskReview = { id: string; status: string; decision: string; reason: string; reviewedBy: string | null; reviewedAt: string | null };
type RiskDetail = {
  id: string; ruleCode: string; riskLevel: string; riskScore: number; recommendedAction: string;
  businessType: string; businessId: string | null; userId: string | null; requestId: string | null;
  sourceHash: string | null; summary: string; status: string; occurrences: number;
  firstSeenAt: string | null; lastSeenAt: string | null; expiresAt: string | null;
  createdAt: string | null; updatedAt: string | null; resolvedAt: string | null;
  metadata: Record<string, unknown>; reviews: RiskReview[];
};
type AuditLog = { id: string; target_id: string | null; admin_email: string | null; action: string; result: string; request_id: string; error_message: string | null; created_at: string };

export default function AdminRiskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<RiskDetail | null>(null);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [auditError, setAuditError] = useState("");

  const loadEvent = useCallback(async () => {
    setLoading(true); setError(""); setAuditError("");
    try {
      const response = await fetch(`/api/admin/risk/${id}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "风险事件读取失败");
      setEvent(payload.event ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "风险事件读取失败"); setEvent(null);
    }

    try {
      const response = await fetch(`/api/admin/audit-logs?targetId=${encodeURIComponent(id)}&pageSize=50`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "审计日志读取失败");
      setAudits(Array.isArray(payload.logs) ? payload.logs.filter((log: AuditLog) => log.target_id === id) : []);
    } catch (loadError) {
      setAuditError(loadError instanceof Error ? loadError.message : "审计日志读取失败"); setAudits([]);
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void loadEvent(); }, [loadEvent]);

  return (
    <AdminPageShell title="风险事件详情" description="查看风险证据、安全摘要、状态时间线和关联后台审计记录。" actions={<Button variant="outline" onClick={() => void loadEvent()} disabled={loading}><RefreshCcw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />{loading ? "刷新中..." : "刷新"}</Button>}>
      <div className="mb-3 shrink-0"><Link href="/admin/risk" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"><ArrowLeft className="h-4 w-4" />返回风险审核中心</Link></div>
      <div className="min-h-0 flex-1 overflow-auto">
        {error ? <AdminErrorState title="风险事件加载失败" description={error} onRetry={() => void loadEvent()} /> : loading && !event ? <AdminTableSkeleton rows={8} /> : event ? (
          <div className="grid gap-4 pb-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-4">
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="font-mono text-xs text-slate-400">{event.id}</div><h2 className="mt-1 text-xl font-semibold text-slate-950">{event.ruleCode}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{event.summary}</p></div><RiskBadge level={event.riskLevel} score={event.riskScore} /></div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Info label="业务类型" value={event.businessType} />
                  <Info label="业务编号" value={event.businessId ?? "—"} link={businessHref(event)} />
                  <Info label="关联用户" value={event.userId ? shortId(event.userId) : "—"} link={event.userId ? `/admin/users?search=${encodeURIComponent(event.userId)}` : undefined} />
                  <Info label="建议动作" value={event.recommendedAction} />
                  <Info label="当前状态" value={event.status} />
                  <Info label="命中次数" value={String(event.occurrences)} />
                  <Info label="来源摘要" value={event.sourceHash ?? "—"} />
                  <Info label="请求编号" value={event.requestId ?? "—"} link={event.requestId ? `/admin/system/request-traces?requestId=${encodeURIComponent(event.requestId)}` : undefined} />
                  <Info label="过期时间" value={formatDate(event.expiresAt)} />
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-base font-semibold text-slate-950">安全元数据</h2><p className="mt-1 text-xs text-slate-500">敏感字段由服务端递归脱敏，只展示风险定位所需摘要。</p>{Object.keys(event.metadata).length ? <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-100">{JSON.stringify(event.metadata, null, 2)}</pre> : <AdminEmptyState title="暂无安全元数据" className="min-h-[160px]" />}</section>

              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold text-slate-950">后台审计日志</h2><p className="mt-1 text-xs text-slate-500">仅展示目标 ID 与当前风险事件一致的审计记录。</p></div><Link href={`/admin/audit-logs?targetId=${encodeURIComponent(event.id)}`} className="text-sm font-medium text-primary hover:underline">查看全部</Link></div>{auditError ? <AdminErrorState title="审计日志不可用" description={auditError} className="mt-3 min-h-[160px]" /> : audits.length ? <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">{audits.map((audit) => <div key={audit.id} className="grid gap-1 p-3 text-sm sm:grid-cols-[minmax(0,1fr)_160px]"><div><div className="font-medium text-slate-900">{audit.action} · {audit.result}</div><div className="mt-1 text-xs text-slate-500">{audit.admin_email ?? "未知管理员"} · 请求 {audit.request_id}</div>{audit.error_message ? <div className="mt-1 text-xs text-red-600">{audit.error_message}</div> : null}</div><div className="text-xs tabular-nums text-slate-400 sm:text-right">{formatDate(audit.created_at)}</div></div>)}</div> : <AdminEmptyState icon={<ScrollText className="h-5 w-5" />} title="暂无关联审计日志" description="当前没有以该风险事件为目标的后台操作记录。" className="min-h-[180px]" />}</section>
            </div>

            <aside className="space-y-4">
              <section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div><h2 className="font-semibold text-amber-950">当前为只读审核</h2><p className="mt-1 text-sm leading-6 text-amber-800">现有审核写入不具备事务原子性、幂等和并发保护，因此 V1 不开放批准、拒绝、观察或解除按钮。</p></div></div></section>
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-base font-semibold text-slate-950">状态时间线</h2><div className="mt-4 space-y-4"><Timeline label="风险事件创建" value={event.createdAt} /><Timeline label="首次发现" value={event.firstSeenAt} /><Timeline label="最后发现" value={event.lastSeenAt} />{event.reviews.map((review) => <Timeline key={review.id} label={`${review.decision} · ${review.status}`} value={review.reviewedAt} detail={`${review.reason}${review.reviewedBy ? ` · 管理员 ${shortId(review.reviewedBy)}` : ""}`} />)}{event.resolvedAt ? <Timeline label="事件结束" value={event.resolvedAt} /> : null}<Timeline label="最近更新" value={event.updatedAt} /></div></section>
            </aside>
          </div>
        ) : <AdminEmptyState title="风险事件不存在" />}
      </div>
    </AdminPageShell>
  );
}

function Info({ label, value, link }: { label: string; value: string; link?: string }) { return <div className="rounded-lg border border-slate-100 bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div>{link ? <Link href={link} className="mt-1 block break-all text-sm font-medium text-primary hover:underline">{value}</Link> : <div className="mt-1 break-all text-sm font-medium text-slate-900">{value}</div>}</div>; }
function Timeline({ label, value, detail }: { label: string; value: string | null; detail?: string }) { return <div className="relative border-l-2 border-slate-200 pl-4 before:absolute before:-left-[5px] before:top-1 before:h-2 before:w-2 before:rounded-full before:bg-slate-400"><div className="text-sm font-medium text-slate-900">{label}</div><div className="mt-1 text-xs tabular-nums text-slate-500">{formatDate(value)}</div>{detail ? <div className="mt-1 text-xs leading-5 text-slate-600">{detail}</div> : null}</div>; }
function RiskBadge({ level, score }: { level: string; score: number }) { const cls = level === "critical" || level === "high" ? "bg-red-50 text-red-700 ring-red-200" : level === "medium" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"; return <span className={`inline-flex shrink-0 rounded-full px-3 py-1 text-sm font-medium ring-1 ${cls}`}>{level} · {score}</span>; }
function shortId(value: string) { return `${value.slice(0, 8)}…`; }
function businessHref(event: RiskDetail) { if (!event.businessId) return undefined; const search = encodeURIComponent(event.businessId); if (event.businessType === "order") return `/admin/orders?search=${search}`; if (event.businessType === "payment") return `/admin/payments?search=${search}`; if (event.businessType === "recharge") return `/admin/recharges?search=${search}`; if ((event.businessType === "account" || event.businessType === "login") && event.userId) return `/admin/users?search=${encodeURIComponent(event.userId)}`; return undefined; }
function formatDate(value: string | null) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false }); }
