"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CreditCard, RefreshCcw, ScrollText, ShieldAlert, ShoppingBag, UserRound, WalletCards } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { AdminDetailBackLink, AdminRelatedLink, AdminTimeline } from "@/components/admin/v2/AdminDetail";
import { AdminInfoGrid, AdminInfoItem } from "@/components/admin/v2/AdminInfoGrid";
import AdminReadOnlyBadge from "@/components/admin/v2/AdminReadOnlyBadge";
import AdminSection from "@/components/admin/v2/AdminSection";
import AdminStatusBadge, { type AdminStatusTone } from "@/components/admin/v2/AdminStatusBadge";
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
    <AdminPageShell title="风险事件详情" description="查看风险证据、安全摘要、状态时间线和关联后台审计记录。" actions={<div className="flex items-center gap-2"><AdminReadOnlyBadge /><Button variant="outline" onClick={() => void loadEvent()} disabled={loading}><RefreshCcw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />{loading ? "刷新中..." : "刷新"}</Button></div>}>
      <div className="mb-3 shrink-0"><AdminDetailBackLink href="/admin/risk">返回风险审核中心</AdminDetailBackLink></div>
      <div className="min-h-0 flex-1 overflow-auto">
        {error ? <AdminErrorState title="风险事件加载失败" description={error} onRetry={() => void loadEvent()} /> : loading && !event ? <AdminTableSkeleton rows={8} /> : event ? (
          <div className="space-y-4 pb-4">
            <AdminSection title={event.ruleCode} description={event.id} action={<AdminStatusBadge tone={riskTone(event.riskLevel)}>{event.riskLevel} · {event.riskScore}</AdminStatusBadge>}>
              <AdminInfoGrid columns={3}><AdminInfoItem label="摘要" value={event.summary} className="sm:col-span-2" /><AdminInfoItem label="当前状态" value={<AdminStatusBadge tone={statusTone(event.status)}>{event.status}</AdminStatusBadge>} /><AdminInfoItem label="业务类型" value={event.businessType} /><AdminInfoItem label="命中次数" value={String(event.occurrences)} className="tabular-nums" /><AdminInfoItem label="建议动作" value={event.recommendedAction} /></AdminInfoGrid>
            </AdminSection>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 space-y-4">
                <AdminSection title="风险事实" description="风险定位所需的只读事实"><AdminInfoGrid columns={3}><AdminInfoItem label="事件 ID" value={event.id} mono /><AdminInfoItem label="业务编号" value={event.businessId ?? "—"} mono /><AdminInfoItem label="关联用户" value={event.userId ?? "—"} mono /><AdminInfoItem label="来源摘要" value={event.sourceHash ?? "—"} mono /><AdminInfoItem label="请求编号" value={event.requestId ?? "—"} mono /><AdminInfoItem label="过期时间" value={formatDate(event.expiresAt)} /></AdminInfoGrid></AdminSection>
                <AdminSection title="关联资源" description="进入现有只读运营页面继续定位"><div className="divide-y divide-[var(--admin-v2-border)] px-4 pb-1 sm:px-5">{businessHref(event) && event.businessId ? <AdminRelatedLink icon={businessIcon(event.businessType)} label="关联业务" detail={event.businessId} href={businessHref(event)!} /> : null}{event.userId ? <AdminRelatedLink icon={<UserRound className="h-4 w-4" />} label="关联用户" detail={event.userId} href={`/admin/users/${encodeURIComponent(event.userId)}`} /> : null}{event.requestId ? <AdminRelatedLink icon={<ScrollText className="h-4 w-4" />} label="请求链路" detail={event.requestId} href={`/admin/system/request-traces/${encodeURIComponent(event.requestId)}`} /> : null}</div></AdminSection>
                <AdminSection title="安全元数据" description="敏感字段由服务端递归脱敏，只展示风险定位所需摘要。">{Object.keys(event.metadata).length ? <pre className="mx-4 mb-4 max-h-80 overflow-auto rounded-[var(--admin-v2-control-radius)] bg-slate-950 p-4 text-xs leading-5 text-slate-100 sm:mx-5 sm:mb-5">{JSON.stringify(event.metadata, null, 2)}</pre> : <AdminEmptyState title="暂无安全元数据" className="min-h-[160px]" />}</AdminSection>
                <AdminSection title="后台审计日志" description="严格限定当前风险事件目标 · 最近 50 条" action={<Link href={`/admin/audit-logs?targetId=${encodeURIComponent(event.id)}`} className="text-sm font-medium text-[var(--admin-v2-primary)] hover:underline">查看全部</Link>}>{auditError ? <AdminErrorState title="审计日志不可用" description={auditError} className="mx-4 mb-4 min-h-[160px] sm:mx-5 sm:mb-5" /> : audits.length ? <div className="mx-4 mb-4 divide-y divide-[var(--admin-v2-border)] border-y border-[var(--admin-v2-border)] sm:mx-5 sm:mb-5">{audits.map((audit) => <div key={audit.id} className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_160px]"><div className="min-w-0"><div className="font-medium text-[var(--admin-v2-text-primary)]">{audit.action} · {audit.result}</div><div className="mt-1 break-all text-xs text-[var(--admin-v2-text-muted)]">{audit.admin_email ?? "未知管理员"} · 请求 {audit.request_id}</div>{audit.error_message ? <div className="mt-1 text-xs text-[var(--admin-v2-danger-foreground)]">{audit.error_message}</div> : null}</div><div className="text-xs tabular-nums text-[var(--admin-v2-text-muted)] sm:text-right">{formatDate(audit.created_at)}</div></div>)}</div> : <AdminEmptyState icon={<ScrollText className="h-5 w-5" />} title="暂无关联审计日志" description="当前没有以该风险事件为目标的后台操作记录。" className="min-h-[180px]" />}</AdminSection>
              </div>
              <aside className="space-y-4">
                <div className="rounded-[var(--admin-v2-surface-radius)] border border-[var(--admin-v2-warning-foreground)]/20 bg-[var(--admin-v2-warning-background)] p-4"><div className="flex gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--admin-v2-warning-foreground)]" /><div><h2 className="font-semibold text-[var(--admin-v2-text-primary)]">当前为只读审核</h2><p className="mt-1 text-sm leading-6 text-[var(--admin-v2-text-secondary)]">现有审核写入不具备事务原子性、幂等和并发保护，因此不开放批准、拒绝、观察或解除按钮。</p></div></div></div>
                <AdminSection title="状态时间线" description="风险生命周期与已有审核记录"><AdminTimeline items={riskTimeline(event)} empty={<AdminEmptyState title="暂无状态记录" className="min-h-[140px]" />} /></AdminSection>
              </aside>
            </div>
          </div>
        ) : <AdminEmptyState title="风险事件不存在" />}
      </div>
    </AdminPageShell>
  );
}

function shortId(value: string) { return `${value.slice(0, 8)}…`; }
function businessHref(event: RiskDetail) { if (!event.businessId) return undefined; const search = encodeURIComponent(event.businessId); if (event.businessType === "order") return `/admin/orders?search=${search}`; if (event.businessType === "payment") return `/admin/payments?search=${search}`; if (event.businessType === "recharge") return `/admin/recharges?search=${search}`; if ((event.businessType === "account" || event.businessType === "login") && event.userId) return `/admin/users?search=${encodeURIComponent(event.userId)}`; return undefined; }
function formatDate(value: string | null) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false }); }
function riskTone(level: string): AdminStatusTone { return level === "critical" || level === "high" ? "danger" : level === "medium" ? "warning" : "success"; }
function statusTone(status: string): AdminStatusTone { return status === "resolved" || status === "closed" ? "success" : status === "open" || status === "pending" ? "warning" : "neutral"; }
function businessIcon(type: string) { if (type === "order") return <ShoppingBag className="h-4 w-4" />; if (type === "payment") return <CreditCard className="h-4 w-4" />; if (type === "recharge") return <WalletCards className="h-4 w-4" />; return <ShieldAlert className="h-4 w-4" />; }
function riskTimeline(event: RiskDetail) { return [{ id: "created", title: "风险事件创建", time: formatDate(event.createdAt) }, { id: "first", title: "首次发现", time: formatDate(event.firstSeenAt) }, { id: "last", title: "最后发现", time: formatDate(event.lastSeenAt) }, ...event.reviews.map((review) => ({ id: review.id, title: `${review.decision} · ${review.status}`, time: formatDate(review.reviewedAt), actor: review.reviewedBy ? `管理员 ${shortId(review.reviewedBy)}` : undefined, message: review.reason })), ...(event.resolvedAt ? [{ id: "resolved", title: "事件结束", time: formatDate(event.resolvedAt) }] : []), { id: "updated", title: "最近更新", time: formatDate(event.updatedAt) }]; }
