"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, RefreshCw, ShieldCheck, UserRound } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminErrorState from "@/components/admin/AdminErrorState";
import AdminPageShell from "@/components/admin/AdminPageShell";
import AdminTableSkeleton from "@/components/admin/AdminTableSkeleton";
import { Button } from "@/components/ui/button";
import { AdminInfoGrid, AdminInfoItem } from "@/components/admin/v2/AdminInfoGrid";
import AdminReadOnlyBadge from "@/components/admin/v2/AdminReadOnlyBadge";
import AdminSection from "@/components/admin/v2/AdminSection";
import AdminStatusBadge, { type AdminStatusTone } from "@/components/admin/v2/AdminStatusBadge";
import v2Styles from "@/components/admin/v2/AdminV2.module.css";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  requested: "已提交", verifying: "校验中", blocked: "有阻塞项", approved: "已批准",
  processing: "处理中", completed: "已完成", cancelled: "已取消", failed: "失败",
};
const TYPE_LABELS: Record<string, string> = { data_export: "数据导出", account_deletion: "账号注销" };

type Row = Record<string, unknown>;
type PrivacyDetail = {
  request: {
    id: string; requestNo: string; userId: string; userEmail: string | null; userLabel: string;
    requestType: string; status: string; reasonDetail: string | null; blockReasons: string[];
    reviewNote: string | null; reviewedBy: string | null; reviewedAt: string | null;
    createdAt: string | null; updatedAt: string | null; cooldownUntil: string | null;
    completedAt: string | null; cancelledAt: string | null; failedAt: string | null;
  };
  events: Row[];
  auditLogs: Row[];
  errors?: Record<string, string>;
};

export default function AdminPrivacyRequestDetailPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const [detail, setDetail] = useState<PrivacyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/privacy-requests/" + requestId, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "隐私请求详情加载失败。");
      setDetail(payload as PrivacyDetail);
    } catch (loadError) {
      setDetail(null);
      setError(loadError instanceof Error ? loadError.message : "隐私请求详情加载失败。");
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => { void loadDetail(); }, [loadDetail]);
  const item = detail?.request;
  const relatedSearch = encodeURIComponent(item?.userEmail || item?.userId || "");

  return (
    <AdminPageShell
      title="隐私请求详情"
      description="只读查看请求摘要、用户关联、最近处理时间线和严格匹配的后台审计。"
      actions={<><AdminReadOnlyBadge /><Button className={v2Styles.control} variant="outline" onClick={() => void loadDetail()} disabled={loading}><RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />{loading ? "刷新中..." : "刷新"}</Button></>}
    >
      <div className="mb-3 shrink-0"><Link href="/admin/privacy-requests" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--admin-v2-text-secondary)] hover:text-[var(--admin-v2-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-v2-primary)]"><ArrowLeft className="h-4 w-4" />返回隐私请求</Link></div>
      <div className="min-h-0 flex-1 overflow-auto pb-4">
        {error ? <AdminErrorState title="隐私请求详情加载失败" description={error} onRetry={() => void loadDetail()} /> : loading && !detail ? <AdminTableSkeleton rows={10} /> : detail && item ? (
          <div className="space-y-4">
            {detail.errors && Object.keys(detail.errors).length ? <Notice>部分关联数据读取失败：{Object.values(detail.errors).join("、")}</Notice> : null}
            <AdminSection title={TYPE_LABELS[item.requestType] ?? item.requestType} description={item.requestNo || item.id} action={<AdminStatusBadge tone={statusTone(item.status)}>{STATUS_LABELS[item.status] ?? item.status}</AdminStatusBadge>}>
              <AdminInfoGrid columns={3}>
                <AdminInfoItem label="申请人" value={item.userEmail || item.userLabel || "—"} secondary={item.userId || undefined} />
                <AdminInfoItem label="提交时间" value={formatDate(item.createdAt)} />
                <AdminInfoItem label="最近更新" value={formatDate(item.updatedAt)} />
                <AdminInfoItem label="预计处理时间" value={formatDate(item.cooldownUntil)} />
                <AdminInfoItem label="当前阻塞原因" value={item.blockReasons.length ? item.blockReasons.join("；") : "无"} />
                <AdminInfoItem label="完成 / 关闭时间" value={formatDate(item.completedAt || item.cancelledAt || item.failedAt)} />
              </AdminInfoGrid>
            </AdminSection>

            <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 space-y-4">
                <AdminSection title="请求信息" description="业务事实">
                  <AdminInfoGrid>
                    <AdminInfoItem label="请求编号" value={item.requestNo || "—"} mono />
                    <AdminInfoItem label="请求 ID" value={item.id} mono />
                    <AdminInfoItem label="请求类型" value={TYPE_LABELS[item.requestType] ?? item.requestType} />
                    <AdminInfoItem label="请求状态" value={STATUS_LABELS[item.status] ?? item.status} />
                    <AdminInfoItem label="关联用户" value={item.userLabel || item.userEmail || "—"} secondary={item.userId || undefined} />
                    <AdminInfoItem label="联系邮箱" value={item.userEmail || "—"} />
                    <AdminInfoItem label="用户申请说明" value={item.reasonDetail || "—"} />
                    <AdminInfoItem label="审核备注" value={item.reviewNote || "—"} />
                    <AdminInfoItem label="处理人 ID" value={item.reviewedBy || "—"} mono />
                    <AdminInfoItem label="审核时间" value={formatDate(item.reviewedAt)} />
                  </AdminInfoGrid>
                </AdminSection>

                {item.userId ? <AdminSection title="关联资源" description="保留当前请求上下文的只读导航"><div className="divide-y divide-[var(--admin-v2-border)] px-4 pb-1 sm:px-5"><RelatedLink icon={<UserRound className="h-4 w-4" />} label="用户详情" href={"/admin/users/" + item.userId} /><RelatedLink label="关联订单" href={"/admin/orders?search=" + relatedSearch} /><RelatedLink label="关联支付" href={"/admin/payments?search=" + relatedSearch} /><RelatedLink label="关联充值" href={"/admin/recharges?search=" + relatedSearch} /><RelatedLink label="关联退款" href={"/admin/refunds?search=" + relatedSearch} /></div></AdminSection> : null}

                <AdminSection title="最近后台审计" description="当前返回记录 · 严格限定当前隐私请求" action={<Link href={"/admin/audit-logs?targetId=" + encodeURIComponent(item.id)} className="text-sm font-medium text-[var(--admin-v2-primary)] hover:underline">查看全部</Link>}>
                  <RecordList rows={detail.auditLogs} columns={[["admin_email", "管理员"], ["action", "操作"], ["result", "结果"], ["request_id", "请求编号"], ["reason", "原因"], ["created_at", "时间"]]} />
                </AdminSection>
              </div>

              <aside className="min-w-0 space-y-4">
                <AdminSection title="请求时间线" description="最近 50 条以内 · 非历史总数">
                  <Timeline rows={detail.events} />
                </AdminSection>
                <div className="px-1 py-2 text-xs leading-[18px] text-[var(--admin-v2-text-muted)]"><ShieldCheck className="mb-2 h-4 w-4" /><div className="font-medium text-[var(--admin-v2-text-secondary)]">只读隐私工作区</div><p className="mt-1">不执行数据导出、账号删除、匿名化或状态变更。</p></div>
              </aside>
            </div>
            <Notice>本页面不执行数据导出、账号删除或匿名化，也不修改隐私请求状态。订单、支付、充值、退款与资金流水按既有保留规则处理。</Notice>
          </div>
        ) : <AdminEmptyState title="隐私请求不存在" />}
      </div>
    </AdminPageShell>
  );
}

function RelatedLink({ label, href, icon }: { label: string; href: string; icon?: React.ReactNode }) {
  return <Link href={href} className="flex min-h-11 items-center gap-3 py-3 text-sm font-medium text-[var(--admin-v2-text-primary)] transition-colors duration-150 hover:text-[var(--admin-v2-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-v2-primary)]">{icon}<span className="flex-1">{label}</span><span className="inline-flex items-center gap-1 text-xs font-normal text-[var(--admin-v2-text-muted)]">查看<ArrowUpRight className="h-3.5 w-3.5" /></span></Link>;
}
function RecordList({ rows, columns }: { rows: Row[]; columns: [string, string][] }) {
  if (!rows.length) return <AdminEmptyState title="暂无记录" className="min-h-[160px]" />;
  return <div className={cn(v2Styles.tableSurface, "mx-4 mb-4 sm:mx-5 sm:mb-5")}><table className="min-w-[760px] text-sm leading-[22px]"><thead className="bg-[var(--admin-v2-surface-muted)] text-left text-xs text-[var(--admin-v2-text-muted)]"><tr>{columns.map(([, label]) => <th key={label} className="h-9 whitespace-nowrap px-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-[var(--admin-v2-border)]">{rows.map((row, index) => <tr key={String(row.id ?? index)} className="hover:bg-[var(--admin-v2-surface-muted)]">{columns.map(([key]) => <td key={key} className={cn("max-w-[320px] truncate whitespace-nowrap px-3 py-2 text-[13px]", /(?:id|request_id)/i.test(key) && "font-mono text-xs")} title={safeText(row[key])}>{renderValue(key, row[key])}</td>)}</tr>)}</tbody></table></div>;
}
function Timeline({ rows }: { rows: Row[] }) {
  if (!rows.length) return <AdminEmptyState title="暂无记录" className="min-h-[160px]" />;
  return <ol className="mx-5 mb-5 list-none p-0">{rows.map((row, index) => <li key={String(row.id ?? index)} className="relative border-l border-[var(--admin-v2-border)] pb-6 pl-5 last:border-transparent last:pb-0"><span className="absolute -left-1 top-1.5 h-2 w-2 rounded-full bg-[var(--admin-v2-primary)]" aria-hidden="true" /><h3 className="text-sm font-semibold leading-[22px]">{safeText(row.eventType)}</h3><time className="text-xs leading-[18px] text-[var(--admin-v2-text-muted)]">{formatDate(typeof row.createdAt === "string" ? row.createdAt : null)}</time><p className="mt-2 text-sm text-[var(--admin-v2-text-secondary)]">{safeText(row.actorType)}</p>{row.message ? <p className="mt-0.5 text-xs leading-[18px] text-[var(--admin-v2-text-muted)]">{safeText(row.message)}</p> : null}</li>)}</ol>;
}
function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">{children}</div>;
}
function renderValue(key: string, value: unknown) {
  return /(?:At|_at)$/.test(key) ? formatDate(typeof value === "string" ? value : null) : safeText(value);
}
function safeText(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "string" ? value : String(value);
}
function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { hour12: false });
}
function statusTone(status: string): AdminStatusTone {
  if (status === "completed" || status === "approved") return "success";
  if (status === "failed" || status === "blocked") return "danger";
  if (status === "verifying" || status === "processing") return "info";
  if (status === "requested") return "warning";
  return "neutral";
}
